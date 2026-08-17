import Foundation

/// Can we cook this tonight? Answered against the stock, per ingredient.
///
/// Only linked ingredients are judged. Free text ("una pizca de sal") is shown
/// and never counted — the same rule the suggestion engine follows, for the same
/// reason: inventing a quantity is worse than saying nothing.

enum IngredientStatus {
    case have
    case low
    case missing
    case unlinked
}

struct Availability: Equatable {
    var missing: Int
    var low: Int
    /// Nothing linked at all — the recipe can't be judged, so it isn't.
    var unknown: Bool
}

enum RecipeAvailability {
    static func status(_ ingredient: Ingredient, itemsById: [String: Item]) -> IngredientStatus {
        guard let itemId = ingredient.itemId, let item = itemsById[itemId] else { return .unlinked }

        if item.tracking == .level {
            let level = item.level ?? 0
            if level == 0 { return .missing }
            return level <= (item.minLevel ?? 1) ? .low : .have
        }

        let have = item.quantity ?? 0
        let need = ingredient.quantity ?? 0
        if have < need { return .missing }
        return have <= (item.minQuantity ?? 0) ? .low : .have
    }

    /// How short we are, in the item's unit. 0 when nothing is missing.
    static func shortfall(_ ingredient: Ingredient, itemsById: [String: Item]) -> Int {
        guard let itemId = ingredient.itemId, let item = itemsById[itemId],
              item.tracking == .quantity
        else { return 0 }
        return max(0, (ingredient.quantity ?? 0) - (item.quantity ?? 0))
    }

    static func of(_ recipe: Recipe, itemsById: [String: Item]) -> Availability {
        var missing = 0
        var low = 0
        var linked = 0

        for ingredient in recipe.ingredients where !ingredient.optional {
            switch status(ingredient, itemsById: itemsById) {
            case .unlinked:
                continue
            case .missing:
                linked += 1
                missing += 1
            case .low:
                linked += 1
                low += 1
            case .have:
                linked += 1
            }
        }

        return Availability(missing: missing, low: low, unknown: linked == 0)
    }
}
