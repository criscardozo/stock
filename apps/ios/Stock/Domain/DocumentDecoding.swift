import Foundation

/// Firestore documents -> domain models, without Firestore.
///
/// Decoding is by hand on purpose — the models carry no Firebase types, so the
/// shared vectors run without an SDK. This file is the other half of that: the
/// bodies take `(id, data)`, which is all they ever needed, and live here so
/// StockTests can compile them. `Data/Firestore+Decoding.swift` is now five
/// adapters that unwrap a `DocumentSnapshot` and call in.
///
/// What is actually worth checking here is not the field mapping — a wrong key
/// gives an empty screen, which is loud. It is the DEFAULTS: a category with no
/// hue falls back to violet, a household with no planConfig to fortnightly
/// starting Saturday. Those produce a screen that looks right and is wrong.

extension Item {
    init?(id: String, data: [String: Any]) {
        guard
            let name = data["name"] as? String,
            let categoryId = data["categoryId"] as? String,
            let locationId = data["locationId"] as? String,
            let trackingRaw = data["tracking"] as? String,
            let tracking = Tracking(rawValue: trackingRaw)
        else { return nil }

        self.init(
            id: id,
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
            spare: data["spare"] as? Int,
            minSpare: data["minSpare"] as? Int,
            autoSuggest: data["autoSuggest"] as? Bool,
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
    init?(id: String, data: [String: Any]) {
        guard let title = data["title"] as? String else { return nil }

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
            id: id,
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
    init?(id: String, data: [String: Any]) {
        guard
            let startDate = data["startDate"] as? String,
            let endDate = data["endDate"] as? String,
            let lengthRaw = data["length"] as? String,
            let length = PlanLength(rawValue: lengthRaw)
        else { return nil }

        // Cast the map loosely and each entry individually: as
        // `[String: [String: Any]]` the whole cast fails when a single value is
        // not a dictionary — an older build's cleared day wrote a literal null
        // — and the fortnight came back empty rather than short one day.
        var days: [CalendarDate.Iso: PlanDay] = [:]
        for (date, value) in data["days"] as? [String: Any] ?? [:] {
            guard let raw = value as? [String: Any] else { continue }
            days[date] = PlanDay(
                recipeId: raw["recipeId"] as? String,
                label: raw["label"] as? String,
                status: DayStatus(rawValue: raw["status"] as? String ?? "planned") ?? .planned,
                cookedAt: raw["cookedAt"] as? String
            )
        }

        self.init(
            id: id,
            startDate: startDate,
            endDate: endDate,
            length: length,
            days: days
        )
    }
}

extension ShoppingEntry {
    init?(id: String, data: [String: Any]) {
        guard
            let label = data["label"] as? String,
            let sourceRaw = data["source"] as? String,
            let source = ShoppingSource(rawValue: sourceRaw),
            let addedBy = data["addedBy"] as? String
        else { return nil }

        self.init(
            id: id,
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
    init?(id: String, data: [String: Any]) {
        guard
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
            id: id,
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
