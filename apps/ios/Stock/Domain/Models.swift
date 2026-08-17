import Foundation

/// The Firestore contract, in Swift. `shared/schema.md` is the source of truth —
/// when the two disagree, the schema is right.

enum Unit: String, Codable, CaseIterable {
    case unit
    case g
    case ml

    var symbol: String { self == .unit ? "u" : rawValue }

    /// Increment for the +/− buttons.
    var step: Int { self == .unit ? 1 : 100 }
}

enum Tracking: String, Codable {
    case quantity
    case level
}

/// 0 empty · 1 low · 2 half · 3 full
typealias Level = Int

enum Levels {
    static let names = ["vacío", "poco", "medio", "lleno"]
    static func name(_ level: Level) -> String { names[min(max(level, 0), 3)] }
}

struct Category: Codable, Hashable {
    var name: String
    /// SF Symbol-ish name is NOT used: the design is Material Symbols, mapped in Theme.
    var icon: String
    /// Palette name from docs/design/tokens.md — never a raw colour.
    var hue: String
    var kind: String
    var sortOrder: Int
}

struct Location: Codable, Hashable {
    var name: String
    var icon: String
    var hue: String
    var sortOrder: Int
}

struct Member: Codable, Hashable {
    var displayName: String
    var photoURL: String?
}

struct PlanConfig: Codable, Hashable {
    var length: PlanLength
    /// 0 = Sunday.
    var startWeekday: Int
}

struct Household: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var timezone: String
    var currency: String
    var memberIds: [String]
    var members: [String: Member]
    var locations: [String: Location]
    var categories: [String: Category]
    var planConfig: PlanConfig
}

/// The catalogue entry AND the stock, in one document.
struct Item: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var brand: String?
    var categoryId: String
    var locationId: String
    var tracking: Tracking
    // present when tracking == .quantity
    var unit: Unit?
    var quantity: Int?
    var minQuantity: Int?
    // present when tracking == .level
    var level: Level?
    var minLevel: Level?
    var packSize: String?
    var barcodes: [String]
    var expiresAt: CalendarDate.Iso?
    var snoozedUntil: CalendarDate.Iso?
    var lastPriceCents: Int?
    var notes: String?
}

struct Ingredient: Codable, Hashable {
    var label: String
    var itemId: String?
    var quantity: Int?
    var unit: Unit?
    var optional: Bool
}

struct Recipe: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var icon: String?
    var servings: Int
    var steps: String?
    var tags: [String]
    var ingredients: [Ingredient]
    var timesCooked: Int
    var lastCookedAt: CalendarDate.Iso?
}

enum DayStatus: String, Codable {
    case planned
    case cooked
    case skipped
}

struct PlanDay: Codable, Hashable {
    var recipeId: String?
    var label: String?
    var status: DayStatus
    var cookedAt: CalendarDate.Iso?
}

struct MealPlan: Codable, Identifiable, Hashable {
    var id: CalendarDate.Iso
    var startDate: CalendarDate.Iso
    var endDate: CalendarDate.Iso
    var length: PlanLength
    var days: [CalendarDate.Iso: PlanDay]
}

enum ShoppingSource: String, Codable {
    case min
    case plan
    case manual
}

struct ShoppingEntry: Codable, Identifiable, Hashable {
    var id: String
    var label: String
    var itemId: String?
    var quantity: Int?
    var unit: Unit?
    var source: ShoppingSource
    /// Frozen when the row was added — it explains how the row got here.
    var reason: String?
    var checked: Bool
    var checkedBy: String?
    var addedBy: String
    /// Local metadata, never stored: this write hasn't reached the server yet.
    /// The supermarket is exactly where there is no signal.
    var pending: Bool = false
}

enum MoveType: String, Codable {
    case purchase
    case cook
    case adjust
    case waste
}
