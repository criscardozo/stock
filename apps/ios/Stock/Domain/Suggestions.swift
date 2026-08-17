import Foundation

/// What the app OFFERS to put on the shopping list. The list itself is stored,
/// shared data; this is the panel underneath it.
///
/// The TypeScript twin lives in `apps/web/src/lib/domain/suggestions.ts`, and
/// both are validated by `shared/shopping-vectors.json` — change the vectors
/// first.

struct PlanRef: Equatable, Hashable {
    var recipeId: String
    var date: CalendarDate.Iso
}

struct Suggestion: Equatable, Identifiable {
    var itemId: String
    var source: ShoppingSource
    /// Absent for level-tracked items, and when you are exactly at the trigger point.
    var quantity: Int?
    var planRefs: [PlanRef]

    var id: String { itemId }
}

enum Suggestions {
    struct Input {
        var today: CalendarDate.Iso
        var items: [Item]
        var plan: MealPlan?
        var recipes: [Recipe]
        var listItemIds: [String]
    }

    private struct Demand {
        var need: Int = 0
        var refs: [PlanRef] = []
    }

    /// What the meals still to be cooked will consume. Days already cooked or
    /// skipped, and days in the past, contribute nothing: you don't shop for
    /// Tuesday on Thursday.
    private static func demand(_ input: Input) -> [String: Demand] {
        var demand: [String: Demand] = [:]
        guard let plan = input.plan else { return demand }

        let byId = Dictionary(uniqueKeysWithValues: input.recipes.map { ($0.id, $0) })

        for date in plan.days.keys.sorted() {
            guard date >= input.today, let day = plan.days[date] else { continue }
            guard day.status == .planned, let recipeId = day.recipeId else { continue }
            // A deleted recipe is ignored, not a crash.
            guard let recipe = byId[recipeId] else { continue }

            for ingredient in recipe.ingredients {
                // Optional and free-text ingredients are invisible to the
                // engine, on purpose.
                guard !ingredient.optional, let itemId = ingredient.itemId else { continue }
                var current = demand[itemId] ?? Demand()
                current.need += ingredient.quantity ?? 0
                current.refs.append(PlanRef(recipeId: recipe.id, date: date))
                demand[itemId] = current
            }
        }
        return demand
    }

    static func compute(_ input: Input) -> [Suggestion] {
        let onList = Set(input.listItemIds)
        let planned = demand(input)
        var out: [Suggestion] = []

        for item in input.items {
            if onList.contains(item.id) || ItemState.isSnoozed(item, today: input.today) { continue }

            let refs = planned[item.id]?.refs ?? []
            let belowOwnMin = ItemState.stock(item) != .ok

            if item.tracking == .level {
                // Never a number: inventing "250 ml of oil" is worse than saying
                // nothing, so the plan can enrich the reason but cannot trigger
                // the suggestion.
                guard belowOwnMin else { continue }
                out.append(Suggestion(itemId: item.id, source: .min, quantity: nil, planRefs: refs))
                continue
            }

            let quantity = item.quantity ?? 0
            // The minimum is the cushion you want left AFTER cooking what's
            // planned. Being out counts on its own: a minimum of 0 means "no
            // floor", not "never tell me" — that's what snooze is for.
            let threshold = (item.minQuantity ?? 0) + (planned[item.id]?.need ?? 0)
            if !belowOwnMin && quantity >= threshold { continue }

            let shortfall = max(0, threshold - quantity)
            out.append(
                Suggestion(
                    itemId: item.id,
                    source: belowOwnMin ? .min : .plan,
                    quantity: shortfall > 0 ? shortfall : nil,
                    planRefs: refs
                )
            )
        }

        // Sorted by itemId so the vectors are deterministic; presentation order
        // (category, then name) is a UI concern.
        return out.sorted { $0.itemId < $1.itemId }
    }

    /// The text frozen onto the row when a suggestion is accepted. It is a
    /// snapshot: if the stock changes afterwards, what explains the row is still
    /// why it got there.
    static func reason(
        for suggestion: Suggestion,
        item: Item,
        recipes: [Recipe],
        formatDay: (CalendarDate.Iso) -> String
    ) -> String {
        var bits: [String] = []

        if suggestion.source == .min {
            if item.tracking == .quantity {
                let left = item.quantity ?? 0
                bits.append(left == 0 ? "no queda" : "quedan \(left), mínimo \(item.minQuantity ?? 0)")
            } else {
                bits.append("nivel: \(Levels.name(item.level ?? 0))")
            }
        }

        let byId = Dictionary(uniqueKeysWithValues: recipes.map { ($0.id, $0) })
        for ref in suggestion.planRefs {
            guard let title = byId[ref.recipeId]?.title else { continue }
            bits.append("para \(title) (\(formatDay(ref.date)))")
        }

        return bits.joined(separator: " · ")
    }
}
