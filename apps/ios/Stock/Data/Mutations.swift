import FirebaseFirestore
import Foundation
import OSLog

/// Every write the iOS app makes.
///
/// Two rules run through all of it, the same as on the web:
///  - anything touching more than one document is a `WriteBatch`, so cooking a
///    meal or closing a shop either happens or doesn't;
///  - the UI does NOT await these. Firestore only resolves a write when the
///    server confirms it, so awaiting freezes the screen while the data is
///    already saved locally.
enum Mutations {
    private static var db: Firestore { Firestore.firestore() }

    private static func household(_ id: String) -> DocumentReference {
        db.collection("households").document(id)
    }

    /// What happened to one item, newest first.
    ///
    /// The only READ in this file, and it is here because it is the mirror of
    /// the writes above: `moves` grows forever, so it is fetched once with a
    /// hard limit and never listened to. The composite index this needs
    /// (`itemId` ascending, `at` descending) is already deployed.
    static func recentMoves(
        householdId: String,
        itemId: String,
        max: Int = 20
    ) async throws -> [Move] {
        let snapshot = try await household(householdId)
            .collection("moves")
            .whereField("itemId", isEqualTo: itemId)
            .order(by: "at", descending: true)
            .limit(to: max)
            .getDocuments()
        return snapshot.documents.compactMap(Move.init(document:))
    }

    /// Called when the SERVER refuses a write.
    ///
    /// Firestore does not fail a write for being offline — it queues it locally
    /// and sends it later — so anything that reaches here was refused on
    /// purpose: a rule said no, or the document does not have the shape the
    /// rules demand. That means the change the user just made is saved nowhere,
    /// while the local cache keeps showing it as applied. Reported instead of
    /// dropped, because otherwise the app lies for as long as it stays
    /// installed. Wired to `Store.writeError` by `Store.start(uid:)`.
    ///
    /// Main-actor isolated, and so is the closure it holds, because the one
    /// thing it does is set UI state. It used to be a plain global read from
    /// Firestore's completion queue, which worked only because Firestore happens
    /// to call completions on the main queue by default — an assumption nothing
    /// here stated. Isolating it makes the compiler hold that line instead.
    @MainActor static var onWriteRejected: (@MainActor (Error) -> Void)?

    /// Completion handler for every fire-and-forget write: reports a rejection
    /// and ignores success. The UI still does not WAIT for these — not awaiting
    /// and not catching are different things.
    ///
    /// `@Sendable` because Firestore requires it of a completion. It captures
    /// nothing and reads only `log`, and it reaches the main actor by hopping
    /// rather than by assuming which queue it was called on.
    @Sendable private static func reportRejection(_ error: Error?) {
        guard let error else { return }
        // Logged as well as alerted. The alert is for the person holding the
        // phone right now; the log is what a release build can still be asked
        // weeks later, when the only evidence is "it did not save that time".
        log.error("write rejected: \(error.localizedDescription, privacy: .public)")
        Task { @MainActor in onWriteRejected?(error) }
    }

    private static let log = Logger(subsystem: "dev.cardozo.stock", category: "firestore")

    // MARK: - Household

    static func createHousehold(
        uid: String, displayName: String, name: String, timezone: String
    ) async throws -> String {
        let seeds = Seeds.load()
        let householdId = db.collection("households").document().documentID
        let batch = db.batch()

        batch.setData(
            [
                "name": name,
                "timezone": timezone,
                "currency": "AUD",
                "memberIds": [uid],
                "members": [uid: ["displayName": displayName]],
                "locations": seeds.locations,
                "categories": seeds.categories,
                "planConfig": ["length": "fortnightly", "startWeekday": 6],
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
            ],
            forDocument: household(householdId)
        )
        batch.setData(
            [
                "displayName": displayName,
                "householdId": householdId,
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
            ],
            forDocument: db.collection("users").document(uid)
        )

        try await batch.commit()
        return householdId
    }

    /// Joining is a self-add update, not a query: rules cannot see the values in
    /// a `where` clause, so the invite code is the document id instead.
    static func joinHousehold(uid: String, displayName: String, code: String) async throws {
        let invite = try await db.collection("invites")
            .document(code.trimmingCharacters(in: .whitespacesAndNewlines))
            .getDocument()
        guard invite.exists, let householdId = invite.data()?["householdId"] as? String else {
            throw StockError.message("Ese código no existe")
        }

        let snapshot = try await household(householdId).getDocument()
        var memberIds = snapshot.data()?["memberIds"] as? [String] ?? []
        if !memberIds.contains(uid) {
            guard memberIds.count < 2 else { throw StockError.message("Ese hogar ya está completo") }
            memberIds.append(uid)
            try await household(householdId).updateData([
                "memberIds": memberIds,
                "members.\(uid)": ["displayName": displayName],
                "updatedAt": FieldValue.serverTimestamp(),
            ])
        }

        try await db.collection("users").document(uid).setData([
            "displayName": displayName,
            "householdId": householdId,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    static func updateHousehold(_ id: String, _ patch: [String: Any]) {
        var data = patch
        data["updatedAt"] = FieldValue.serverTimestamp()
        household(id).updateData(data, completion: reportRejection)
    }

    // MARK: - Items

    static func adjustStock(
        householdId: String, uid: String, item: Item, quantity: Int? = nil, level: Level? = nil,
        type: MoveType = .adjust
    ) {
        let batch = db.batch()
        let itemRef = household(householdId).collection("items").document(item.id)
        let moveRef = household(householdId).collection("moves").document()

        if item.tracking == .quantity {
            let next = max(0, quantity ?? 0)
            batch.updateData(
                ["quantity": next, "updatedAt": FieldValue.serverTimestamp(), "updatedBy": uid],
                forDocument: itemRef
            )
            batch.setData(
                [
                    "itemId": item.id, "type": type.rawValue,
                    "delta": next - (item.quantity ?? 0),
                    "at": FieldValue.serverTimestamp(), "by": uid,
                ],
                forDocument: moveRef
            )
        } else {
            let next = level ?? 0
            batch.updateData(
                ["level": next, "updatedAt": FieldValue.serverTimestamp(), "updatedBy": uid],
                forDocument: itemRef
            )
            batch.setData(
                [
                    "itemId": item.id, "type": type.rawValue,
                    "levelFrom": item.level ?? 0, "levelTo": next,
                    "at": FieldValue.serverTimestamp(), "by": uid,
                ],
                forDocument: moveRef
            )
        }
        batch.commit(completion: reportRejection)
    }

    static func createItem(householdId: String, uid: String, fields: [String: Any]) {
        var data = fields
        data["barcodes"] = fields["barcodes"] ?? []
        data["createdAt"] = FieldValue.serverTimestamp()
        data["updatedAt"] = FieldValue.serverTimestamp()
        data["updatedBy"] = uid
        household(householdId).collection("items")
            .addDocument(data: data, completion: reportRejection)
    }

    static func updateItem(householdId: String, uid: String, itemId: String, patch: [String: Any]) {
        var data = patch
        data["updatedAt"] = FieldValue.serverTimestamp()
        data["updatedBy"] = uid
        household(householdId).collection("items").document(itemId)
            .updateData(data, completion: reportRejection)
    }

    static func snooze(householdId: String, uid: String, itemId: String, until: CalendarDate.Iso) {
        updateItem(householdId: householdId, uid: uid, itemId: itemId, patch: ["snoozedUntil": until])
    }

    /// A scanned barcode is remembered on the item, so the household's own
    /// catalogue recognises it next time even when Open Food Facts doesn't.
    static func attachBarcode(householdId: String, uid: String, item: Item, barcode: String) {
        guard !item.barcodes.contains(barcode) else { return }
        updateItem(
            householdId: householdId, uid: uid, itemId: item.id,
            patch: ["barcodes": item.barcodes + [barcode]]
        )
    }

    // MARK: - Shopping list

    static func addToList(householdId: String, uid: String, fields: [String: Any]) {
        var data = fields
        data["checked"] = false
        data["addedAt"] = FieldValue.serverTimestamp()
        data["addedBy"] = uid
        household(householdId).collection("shoppingList")
            .addDocument(data: data, completion: reportRejection)
    }

    /// A tick is just a tick: it strikes the row through and touches no stock.
    static func setChecked(householdId: String, uid: String, entryId: String, checked: Bool) {
        var data: [String: Any] = ["checked": checked]
        if checked {
            data["checkedAt"] = FieldValue.serverTimestamp()
            data["checkedBy"] = uid
        } else {
            data["checkedAt"] = FieldValue.delete()
            data["checkedBy"] = FieldValue.delete()
        }
        household(householdId).collection("shoppingList").document(entryId)
            .updateData(data, completion: reportRejection)
    }

    static func removeFromList(householdId: String, entryId: String) {
        household(householdId).collection("shoppingList").document(entryId)
            .delete(completion: reportRejection)
    }

    struct Purchase {
        var entry: ShoppingEntry
        var item: Item?
        var quantity: Int
        var level: Level
        var expiresAt: CalendarDate.Iso?
        var priceCents: Int?
    }

    /// Closing the shop: ticked rows fold into stock, write their moves and are
    /// deleted. Unticked rows are left alone — that is what makes the list
    /// survive into next week.
    static func closeShopping(householdId: String, uid: String, purchases: [Purchase]) {
        let batch = db.batch()

        for purchase in purchases {
            if let item = purchase.item {
                let itemRef = household(householdId).collection("items").document(item.id)
                let moveRef = household(householdId).collection("moves").document()
                var patch: [String: Any] = [
                    "updatedAt": FieldValue.serverTimestamp(), "updatedBy": uid,
                ]
                if let expiresAt = purchase.expiresAt { patch["expiresAt"] = expiresAt }
                if let price = purchase.priceCents { patch["lastPriceCents"] = price }

                if item.tracking == .quantity {
                    let delta = max(0, purchase.quantity)
                    patch["quantity"] = (item.quantity ?? 0) + delta
                    batch.updateData(patch, forDocument: itemRef)
                    batch.setData(
                        [
                            "itemId": item.id, "type": MoveType.purchase.rawValue, "delta": delta,
                            "at": FieldValue.serverTimestamp(), "by": uid,
                        ],
                        forDocument: moveRef
                    )
                } else if item.minSpare != nil {
                    // What came home is sealed containers — it goes behind the
                    // open one. Filling `level` would throw away the bottle in
                    // use.
                    let delta = max(0, purchase.quantity)
                    patch["spare"] = (item.spare ?? 0) + delta
                    batch.updateData(patch, forDocument: itemRef)
                    batch.setData(
                        [
                            "itemId": item.id, "type": MoveType.purchase.rawValue, "delta": delta,
                            "at": FieldValue.serverTimestamp(), "by": uid,
                        ],
                        forDocument: moveRef
                    )
                } else {
                    patch["level"] = purchase.level
                    batch.updateData(patch, forDocument: itemRef)
                    batch.setData(
                        [
                            "itemId": item.id, "type": MoveType.purchase.rawValue,
                            "levelFrom": item.level ?? 0, "levelTo": purchase.level,
                            "at": FieldValue.serverTimestamp(), "by": uid,
                        ],
                        forDocument: moveRef
                    )
                }
            }
            batch.deleteDocument(
                household(householdId).collection("shoppingList").document(purchase.entry.id))
        }

        batch.commit(completion: reportRejection)
    }

    // MARK: - Meal plan
    //
    // Nothing here. A period's document is materialised by whoever opens the
    // plan first, and that is always the web: iOS has no plan editor, it reads
    // the fortnight and marks meals cooked. `ensurePlan` existed on this side
    // too and was called from nowhere — a second implementation of a
    // deterministic write, kept in step by hand, for a screen that does not
    // exist. Deleted rather than left as a decoy.

    struct Consumption {
        var item: Item
        var quantity: Int?
        var level: Level?
    }

    static func markCooked(
        householdId: String, uid: String, planId: CalendarDate.Iso, date: CalendarDate.Iso,
        recipe: Recipe?, consumption: [Consumption]
    ) {
        let batch = db.batch()

        for use in consumption {
            let itemRef = household(householdId).collection("items").document(use.item.id)
            let moveRef = household(householdId).collection("moves").document()

            if use.item.tracking == .quantity {
                let used = max(0, use.quantity ?? 0)
                if used == 0 { continue }
                batch.updateData(
                    [
                        "quantity": max(0, (use.item.quantity ?? 0) - used),
                        "updatedAt": FieldValue.serverTimestamp(), "updatedBy": uid,
                    ],
                    forDocument: itemRef
                )
                var move: [String: Any] = [
                    "itemId": use.item.id, "type": MoveType.cook.rawValue, "delta": -used,
                    "planDate": date, "at": FieldValue.serverTimestamp(), "by": uid,
                ]
                if let recipe { move["recipeId"] = recipe.id }
                batch.setData(move, forDocument: moveRef)
            } else {
                let level = use.level ?? use.item.level ?? 0
                if level == use.item.level { continue }
                batch.updateData(
                    ["level": level, "updatedAt": FieldValue.serverTimestamp(), "updatedBy": uid],
                    forDocument: itemRef
                )
                var move: [String: Any] = [
                    "itemId": use.item.id, "type": MoveType.cook.rawValue,
                    "levelFrom": use.item.level ?? 0, "levelTo": level,
                    "planDate": date, "at": FieldValue.serverTimestamp(), "by": uid,
                ]
                if let recipe { move["recipeId"] = recipe.id }
                batch.setData(move, forDocument: moveRef)
            }
        }

        batch.updateData(
            [
                "days.\(date).status": DayStatus.cooked.rawValue,
                "days.\(date).cookedAt": date,
                "updatedAt": FieldValue.serverTimestamp(),
            ],
            forDocument: household(householdId).collection("mealPlans").document(planId)
        )

        if let recipe {
            batch.updateData(
                [
                    "timesCooked": recipe.timesCooked + 1,
                    "lastCookedAt": date,
                    "updatedAt": FieldValue.serverTimestamp(),
                ],
                forDocument: household(householdId).collection("recipes").document(recipe.id)
            )
        }

        batch.commit(completion: reportRejection)
    }

    static func setPlanDay(
        householdId: String, planId: CalendarDate.Iso, date: CalendarDate.Iso,
        recipeId: String?, label: String?
    ) {
        let ref = household(householdId).collection("mealPlans").document(planId)
        if recipeId == nil && label == nil {
            ref.updateData(
                ["days.\(date)": FieldValue.delete(), "updatedAt": FieldValue.serverTimestamp()],
                completion: reportRejection
            )
            return
        }
        var day: [String: Any] = ["status": DayStatus.planned.rawValue]
        if let recipeId { day["recipeId"] = recipeId }
        if let label { day["label"] = label }
        ref.updateData(
            ["days.\(date)": day, "updatedAt": FieldValue.serverTimestamp()],
            completion: reportRejection
        )
    }
}

enum StockError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        }
    }
}

/// The seed categories and locations, read from the shared contract rather than
/// retyped — the same files the web writes.
enum Seeds {
    static func load() -> (categories: [String: [String: Any]], locations: [String: [String: Any]]) {
        (categories: keyed("categories"), locations: keyed("locations"))
    }

    private static func keyed(_ name: String) -> [String: [String: Any]] {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = root[name] as? [[String: Any]]
        else { return [:] }

        var out: [String: [String: Any]] = [:]
        for var row in rows {
            guard let id = row.removeValue(forKey: "id") as? String else { continue }
            out[id] = row
        }
        return out
    }
}
