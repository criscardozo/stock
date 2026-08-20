import FirebaseFirestore
import Foundation

/// Documents are decoded by hand, on purpose.
///
/// The domain models carry no Firebase types (no `@DocumentID`, no `Timestamp`)
/// so the shared vectors can run without an SDK. The cost is this file; the
/// benefit is that calendar arithmetic and shopping suggestions are testable in
/// milliseconds, without a network.

extension Item {
    init?(document: DocumentSnapshot) {
        guard let data = document.data(),
              let name = data["name"] as? String,
              let categoryId = data["categoryId"] as? String,
              let locationId = data["locationId"] as? String,
              let trackingRaw = data["tracking"] as? String,
              let tracking = Tracking(rawValue: trackingRaw)
        else { return nil }

        self.init(
            id: document.documentID,
            name: name,
            nameEs: data["nameEs"] as? String,
            brand: data["brand"] as? String,
            categoryId: categoryId,
            locationId: locationId,
            tracking: tracking,
            unit: (data["unit"] as? String).flatMap(Unit.init(rawValue:)),
            quantity: data["quantity"] as? Int,
            minQuantity: data["minQuantity"] as? Int,
            level: data["level"] as? Int,
            minLevel: data["minLevel"] as? Int,
            packSize: data["packSize"] as? String,
            barcodes: data["barcodes"] as? [String] ?? [],
            receiptNames: data["receiptNames"] as? [String] ?? [],
            expiresAt: data["expiresAt"] as? String,
            snoozedUntil: data["snoozedUntil"] as? String,
            lastPriceCents: data["lastPriceCents"] as? Int,
            notes: data["notes"] as? String
        )
    }
}

extension Recipe {
    init?(document: DocumentSnapshot) {
        guard let data = document.data(), let title = data["title"] as? String else { return nil }

        let ingredients = (data["ingredients"] as? [[String: Any]] ?? []).map { raw in
            Ingredient(
                label: raw["label"] as? String ?? "",
                itemId: raw["itemId"] as? String,
                quantity: raw["quantity"] as? Int,
                unit: (raw["unit"] as? String).flatMap(Unit.init(rawValue:)),
                optional: raw["optional"] as? Bool ?? false
            )
        }

        self.init(
            id: document.documentID,
            title: title,
            icon: data["icon"] as? String,
            servings: data["servings"] as? Int ?? 2,
            steps: data["steps"] as? String,
            tags: data["tags"] as? [String] ?? [],
            ingredients: ingredients,
            timesCooked: data["timesCooked"] as? Int ?? 0,
            lastCookedAt: data["lastCookedAt"] as? String
        )
    }
}

extension MealPlan {
    init?(document: DocumentSnapshot) {
        guard let data = document.data(),
              let startDate = data["startDate"] as? String,
              let endDate = data["endDate"] as? String,
              let lengthRaw = data["length"] as? String,
              let length = PlanLength(rawValue: lengthRaw)
        else { return nil }

        var days: [CalendarDate.Iso: PlanDay] = [:]
        for (date, raw) in data["days"] as? [String: [String: Any]] ?? [:] {
            days[date] = PlanDay(
                recipeId: raw["recipeId"] as? String,
                label: raw["label"] as? String,
                status: DayStatus(rawValue: raw["status"] as? String ?? "planned") ?? .planned,
                cookedAt: raw["cookedAt"] as? String
            )
        }

        self.init(
            id: document.documentID,
            startDate: startDate,
            endDate: endDate,
            length: length,
            days: days
        )
    }
}

extension ShoppingEntry {
    init?(document: DocumentSnapshot) {
        guard let data = document.data(),
              let label = data["label"] as? String,
              let sourceRaw = data["source"] as? String,
              let source = ShoppingSource(rawValue: sourceRaw),
              let addedBy = data["addedBy"] as? String
        else { return nil }

        self.init(
            id: document.documentID,
            label: label,
            itemId: data["itemId"] as? String,
            quantity: data["quantity"] as? Int,
            unit: (data["unit"] as? String).flatMap(Unit.init(rawValue:)),
            source: source,
            reason: data["reason"] as? String,
            checked: data["checked"] as? Bool ?? false,
            checkedBy: data["checkedBy"] as? String,
            addedBy: addedBy
        )
    }
}

extension Household {
    init?(document: DocumentSnapshot) {
        guard let data = document.data(),
              let name = data["name"] as? String,
              let memberIds = data["memberIds"] as? [String]
        else { return nil }

        func members(_ raw: [String: [String: Any]]) -> [String: Member] {
            raw.compactMapValues { entry in
                guard let displayName = entry["displayName"] as? String else { return nil }
                return Member(displayName: displayName, photoURL: entry["photoURL"] as? String)
            }
        }

        func categories(_ raw: [String: [String: Any]]) -> [String: Category] {
            raw.compactMapValues { entry in
                guard let name = entry["name"] as? String else { return nil }
                return Category(
                    name: name,
                    icon: entry["icon"] as? String ?? "inventory_2",
                    hue: entry["hue"] as? String ?? "violet",
                    kind: entry["kind"] as? String ?? "food",
                    sortOrder: entry["sortOrder"] as? Int ?? 999
                )
            }
        }

        func locations(_ raw: [String: [String: Any]]) -> [String: Location] {
            raw.compactMapValues { entry in
                guard let name = entry["name"] as? String else { return nil }
                return Location(
                    name: name,
                    icon: entry["icon"] as? String ?? "inventory_2",
                    hue: entry["hue"] as? String ?? "violet",
                    sortOrder: entry["sortOrder"] as? Int ?? 999
                )
            }
        }

        let config = data["planConfig"] as? [String: Any] ?? [:]

        self.init(
            id: document.documentID,
            name: name,
            timezone: data["timezone"] as? String ?? "Australia/Sydney",
            currency: data["currency"] as? String ?? "AUD",
            memberIds: memberIds,
            members: members(data["members"] as? [String: [String: Any]] ?? [:]),
            locations: locations(data["locations"] as? [String: [String: Any]] ?? [:]),
            categories: categories(data["categories"] as? [String: [String: Any]] ?? [:]),
            planConfig: PlanConfig(
                length: PlanLength(rawValue: config["length"] as? String ?? "fortnightly") ?? .fortnightly,
                startWeekday: config["startWeekday"] as? Int ?? 6
            )
        )
    }
}
