import FirebaseAuth
import FirebaseFirestore
import Foundation
import Observation

/// Every live listener in the app, in one place.
///
/// All of them are bounded collections — the catalogue (~150 docs), the list
/// (~30), the recipes, and a single plan document. `moves` is deliberately
/// absent: it grows forever, so it is only ever read with a limit.
///
/// Main-actor isolated. Everything that reads or writes this is SwiftUI, and
/// every Firestore listener below mutates it straight from its callback — which
/// was correct only because Firestore delivers those on the main queue unless a
/// `dispatchQueue` is configured, and none is. The annotation turns that into
/// something the compiler checks rather than something that happens to hold.
@MainActor
@Observable
final class Store {
    private(set) var householdId: String?
    private(set) var household: Household?
    private(set) var items: [Item] = []
    private(set) var recipes: [Recipe] = []
    private(set) var list: [ShoppingEntry] = []
    private(set) var plan: MealPlan?
    /// A READ that failed. Set by every listener; shown by RootView.
    private(set) var loadError: String?
    /// A WRITE the server REFUSED. Never set by being offline — Firestore
    /// queues those and sends them later — so anything here means the change
    /// the user just made is saved nowhere while the local cache shows it as
    /// applied. Fed by `Mutations.onWriteRejected`, cleared by dismissing it.
    var writeError: String?

    /// Recomputed on the minute so midnight rolls the plan over without a relaunch.
    private(set) var today: CalendarDate.Iso = CalendarDate.today(in: "Australia/Sydney")

    private var listeners: [ListenerRegistration] = []
    private var planListener: ListenerRegistration?
    private var clock: Timer?
    private var uid: String?

    var itemsById: [String: Item] {
        Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
    }

    var timezone: String { household?.timezone ?? "Australia/Sydney" }

    var planStart: CalendarDate.Iso? {
        guard let household else { return nil }
        return CalendarDate.periodStart(for: today, startWeekday: household.planConfig.startWeekday)
    }

    var suggestions: [Suggestion] {
        Suggestions.compute(
            Suggestions.Input(
                today: today,
                items: items,
                plan: plan,
                recipes: recipes,
                listItemIds: list.compactMap(\.itemId)
            )
        )
    }

    /// Suggestions come out sorted by itemId (deterministic, for the vectors);
    /// on screen they follow the same order as everything else.
    var orderedSuggestions: [Suggestion] {
        let byId = itemsById
        return suggestions.sorted { a, b in
            let orderA = household?.categories[byId[a.itemId]?.categoryId ?? ""]?.sortOrder ?? 999
            let orderB = household?.categories[byId[b.itemId]?.categoryId ?? ""]?.sortOrder ?? 999
            if orderA != orderB { return orderA < orderB }
            return (byId[a.itemId]?.name ?? "") < (byId[b.itemId]?.name ?? "")
        }
    }

    func start(uid: String) {
        guard self.uid != uid else { return }
        stop()
        self.uid = uid
        WatchSync.shared.uid = uid
        WatchSync.shared.start()

        // Claim the write channel. `Mutations` is a static enum by design — it
        // holds no state — so it reports through a closure rather than owning a
        // dependency. Wired here and not in the App's init because reaching into
        // `@State` before the view is installed is exactly what SwiftUI warns
        // about, and this is the lifecycle point that already owns the listeners.
        Mutations.onWriteRejected = { [weak self] error in
            self?.writeError = error.localizedDescription
        }

        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.today = CalendarDate.today(in: self.timezone) }
        }

        let db = Firestore.firestore()
        listeners.append(
            db.collection("users").document(uid).addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                // Swallowing this one is how a misconfigured client looks exactly
                // like a person with no household: the screen offers to create
                // one and never says why.
                if let error { self.loadError = error.localizedDescription; return }
                let id = snapshot?.data()?["householdId"] as? String
                guard id != self.householdId else { return }
                self.householdId = id
                self.attachHousehold(id)
            }
        )
    }

    func stop() {
        listeners.forEach { $0.remove() }
        listeners.removeAll()
        planListener?.remove()
        planListener = nil
        clock?.invalidate()
        clock = nil
        Mutations.onWriteRejected = nil
        uid = nil
        householdId = nil
        household = nil
        items = []
        recipes = []
        list = []
        plan = nil
        // Signing out clears the complaints too: an alert about a write made by
        // the previous session has nobody left to show it to.
        loadError = nil
        writeError = nil
    }

    private func attachHousehold(_ id: String?) {
        // Drop the previous household's listeners AND its data: showing one
        // household's items under another's name is worse than showing nothing.
        listeners.dropFirst().forEach { $0.remove() }
        listeners = Array(listeners.prefix(1))
        planListener?.remove()
        planListener = nil
        household = nil
        items = []
        recipes = []
        list = []
        plan = nil

        WatchSync.shared.householdId = id
        guard let id else { return }
        let db = Firestore.firestore()
        let root = db.collection("households").document(id)

        listeners.append(
            root.addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                if let error { self.loadError = error.localizedDescription; return }
                self.loadError = nil
                self.household = snapshot.flatMap(Household.init(document:))
                self.today = CalendarDate.today(in: self.timezone)
                self.attachPlan()
            }
        )
        listeners.append(
            root.collection("items").addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                // Reported rather than dropped: without this a failed read and
                // an empty catalogue render identically, and the screen states
                // that there is nothing in the house.
                if let error { self.loadError = error.localizedDescription; return }
                self.items = snapshot?.documents.compactMap(Item.init(document:)) ?? []
                self.syncWatch()
            }
        )
        listeners.append(
            root.collection("recipes").addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                if let error { self.loadError = error.localizedDescription; return }
                self.recipes = snapshot?.documents.compactMap(Recipe.init(document:)) ?? []
                self.syncWatch()
            }
        )
        // The one listener asking for metadata: a tick made with no signal has
        // to be able to say so. Metadata events are local — callbacks, not reads.
        listeners.append(
            root.collection("shoppingList")
                .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                    guard let self else { return }
                    if let error { self.loadError = error.localizedDescription; return }
                    self.list = snapshot?.documents.compactMap { document in
                        var entry = ShoppingEntry(document: document)
                        entry?.pending = document.metadata.hasPendingWrites
                        return entry
                    } ?? []
                    self.syncWatch()
                }
        )
    }

    /// Flattens the list for the wrist. Everything is formatted here because the
    /// watch has no domain code — it draws strings and sends back ticks.
    private func syncWatch() {
        let byId = itemsById
        let entries: [[String: Any]] = list.map { entry in
            var row: [String: Any] = [
                WatchSync.Key.id: entry.id,
                WatchSync.Key.label: entry.label,
                WatchSync.Key.checked: entry.checked,
            ]
            var detail = entry.reason ?? ""
            if let quantity = entry.quantity {
                let unit = entry.unit ?? byId[entry.itemId ?? ""]?.unit ?? .unit
                let amount = Quantities.format(quantity, unit)
                detail = detail.isEmpty ? amount : "\(amount) · \(detail)"
            }
            if !detail.isEmpty { row[WatchSync.Key.detail] = detail }
            return row
        }
        WatchSync.shared.push(
            entries: entries,
            today: todaysRecipe?.title ?? todaysDay?.label,
            todayNote: todaysDay == nil ? nil : DayFormat.long(today)
        )
        publishWidget()
    }

    /// Hands the home screen tonight's dinner.
    ///
    /// Called from the same place as the watch push, because it answers the
    /// same question from the same state. Everything the widget will ever know
    /// is written here: it cannot sign in, so it has no other source.
    private func publishWidget() {
        let day = todaysDay
        let recipe = todaysRecipe
        let availability = recipe.map {
            RecipeAvailability.of($0, itemsById: Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) }))
        }
        WidgetBridge.publish(
            WidgetBridge.Snapshot(
                title: recipe?.title ?? day?.label,
                isRecipe: recipe != nil,
                // `unknown` means the recipe links no items, so there is no
                // count — which must not be published as zero, because zero
                // reads as "you have everything".
                missing: availability.flatMap { $0.unknown ? nil : $0.missing },
                cooked: day?.status == .cooked,
                date: today,
                timezone: timezone,
                updatedAtEpoch: Int(Date().timeIntervalSince1970)
            )
        )
    }

    private func attachPlan() {
        guard let householdId, let planStart else { return }
        planListener?.remove()
        planListener = Firestore.firestore()
            .collection("households").document(householdId)
            .collection("mealPlans").document(planStart)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self else { return }
                if let error { self.loadError = error.localizedDescription; return }
                self.plan = snapshot.flatMap(MealPlan.init(document:))
                self.syncWatch()
            }
    }

    /// Today's meal, which is the whole point of the Hoy tab.
    var todaysDay: PlanDay? { plan?.days[today] }
    var todaysRecipe: Recipe? {
        guard let recipeId = todaysDay?.recipeId else { return nil }
        return recipes.first { $0.id == recipeId }
    }
}
