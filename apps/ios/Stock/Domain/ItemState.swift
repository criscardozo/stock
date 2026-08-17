import Foundation

/// Item state is derived on every render, never stored: persisting it would mean
/// rewriting documents to keep a field in sync with the fields that already
/// determine it.

enum StockStatus {
    case out
    case low
    case ok
}

enum ExpiryStatus {
    case expired
    case expiring
    case fresh
    case none
}

enum ItemState {
    /// How many days ahead counts as "vence pronto".
    static let expiringWithinDays = 3

    static func stock(_ item: Item) -> StockStatus {
        if item.tracking == .quantity {
            let quantity = item.quantity ?? 0
            if quantity == 0 { return .out }
            return quantity <= (item.minQuantity ?? 0) ? .low : .ok
        }
        let level = item.level ?? 0
        if level == 0 { return .out }
        return level <= (item.minLevel ?? 1) ? .low : .ok
    }

    static func expiry(_ item: Item, today: CalendarDate.Iso) -> ExpiryStatus {
        guard let expiresAt = item.expiresAt else { return .none }
        if expiresAt < today { return .expired }
        return expiresAt <= CalendarDate.adding(expiringWithinDays, to: today) ? .expiring : .fresh
    }

    /// A snooze silences the SUGGESTION, not the item: today itself is still quiet.
    static func isSnoozed(_ item: Item, today: CalendarDate.Iso) -> Bool {
        guard let until = item.snoozedUntil else { return false }
        return until >= today
    }
}

enum Quantities {
    private static let formatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        return formatter
    }()

    /// `1200, .g` → `"1,2 kg"`. Scaling happens on the way to the screen, never
    /// on the way to the database.
    static func format(_ quantity: Int, _ unit: Unit) -> String {
        let number = NSNumber(value: quantity)
        switch unit {
        case .unit:
            return "\(formatter.string(from: number) ?? "\(quantity)") u"
        case .g where abs(quantity) >= 1000:
            return "\(scaled(quantity)) kg"
        case .g:
            return "\(formatter.string(from: number) ?? "\(quantity)") g"
        case .ml where abs(quantity) >= 1000:
            return "\(scaled(quantity)) L"
        case .ml:
            return "\(formatter.string(from: number) ?? "\(quantity)") ml"
        }
    }

    private static func scaled(_ quantity: Int) -> String {
        formatter.string(from: NSNumber(value: Double(quantity) / 1000)) ?? "\(quantity)"
    }

    /// What an item's current stock reads as, whichever way it is tracked.
    static func stock(_ item: Item) -> String {
        if item.tracking == .quantity {
            return format(item.quantity ?? 0, item.unit ?? .unit)
        }
        return Levels.name(item.level ?? 0)
    }
}
