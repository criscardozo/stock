import FirebaseAuth
import FirebaseFirestore
import Foundation
import Observation

/// Every live listener in the app, in one place.
///
/// All of them are bounded collections — the catalogue (~150 docs), the list
/// (~30), the recipes, and a single plan document. `moves` is deliberately
/// absent: it grows forever, so it is only ever read with a limit.
@Observable
final class Store {
    private(set) var householdId: String?
    private(set) var household: Household?
    private(set) var items: [Item] = []
    private(set) var recipes: [Recipe] = []
    private(set) var list: [ShoppingEntry] = []
    private(set) var plan: MealPlan?
    private(set) var loadError: String?

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

        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.today = CalendarDate.today(in: self.timezone) }
        }

        let db = Firestore.firestore()
        listeners.append(
            db.collection("users").document(uid).addSnapshotListener { [weak self] snapshot, _ in
                let id = snapshot?.data()?["householdId"] as? String
                guard let self, id != self.householdId else { return }
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
        uid = nil
        householdId = nil
        household = nil
        items = []
        recipes = []
        list = []
        plan = nil
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
            root.collection("items").addSnapshotListener { [weak self] snapshot, _ in
                self?.items = snapshot?.documents.compactMap(Item.init(document:)) ?? []
            }
        )
        listeners.append(
            root.collection("recipes").addSnapshotListener { [weak self] snapshot, _ in
                self?.recipes = snapshot?.documents.compactMap(Recipe.init(document:)) ?? []
            }
        )
        // The one listener asking for metadata: a tick made with no signal has
        // to be able to say so. Metadata events are local — callbacks, not reads.
        listeners.append(
            root.collection("shoppingList")
                .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, _ in
                    self?.list = snapshot?.documents.compactMap { document in
                        var entry = ShoppingEntry(document: document)
                        entry?.pending = document.metadata.hasPendingWrites
                        return entry
                    } ?? []
                }
        )
    }

    private func attachPlan() {
        guard let householdId, let planStart else { return }
        planListener?.remove()
        planListener = Firestore.firestore()
            .collection("households").document(householdId)
            .collection("mealPlans").document(planStart)
            .addSnapshotListener { [weak self] snapshot, _ in
                self?.plan = snapshot.flatMap(MealPlan.init(document:))
            }
    }

    /// Today's meal, which is the whole point of the Hoy tab.
    var todaysDay: PlanDay? { plan?.days[today] }
    var todaysRecipe: Recipe? {
        guard let recipeId = todaysDay?.recipeId else { return nil }
        return recipes.first { $0.id == recipeId }
    }
}
