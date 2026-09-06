import XCTest

/// Runs `shared/shopping-vectors.json`, the same file the TypeScript engine
/// runs. If these two ever disagree, one of the clients is lying about what has
/// to be bought.
final class SuggestionsTests: XCTestCase {
    private struct Vectors: Decodable {
        struct RawItem: Decodable {
            let id: String
            let tracking: String
            let unit: String?
            let quantity: Int?
            let minQuantity: Int?
            let level: Int?
            let minLevel: Int?
            let spare: Int?
            let minSpare: Int?
            let autoSuggest: Bool?
            let snoozedUntil: String?
        }
        struct RawDay: Decodable {
            let recipeId: String?
            let label: String?
            let status: String
        }
        struct RawPlan: Decodable {
            let days: [String: RawDay]
        }
        struct RawIngredient: Decodable {
            let label: String?
            let itemId: String?
            let quantity: Int?
            let unit: String?
            let optional: Bool
        }
        struct RawRecipe: Decodable {
            let id: String
            let ingredients: [RawIngredient]
        }
        struct Input: Decodable {
            let today: String
            let items: [RawItem]
            let plan: RawPlan?
            let recipes: [RawRecipe]
            let listItemIds: [String]
        }
        struct Expected: Decodable {
            let itemId: String
            let source: String
            let quantity: Int?
            let planRefs: [Ref]?

            struct Ref: Decodable {
                let recipeId: String
                let date: String
            }
        }
        struct Case: Decodable {
            let name: String
            let input: Input
            let expected: [Expected]
        }

        let cases: [Case]
    }

    private static func load() throws -> Vectors {
        let url = try XCTUnwrap(
            Bundle(for: SuggestionsTests.self).url(
                forResource: "shopping-vectors", withExtension: "json"),
            "shopping-vectors.json is not in the test bundle — check project.yml resources"
        )
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    /// The vectors carry only the fields each case is about; the rest is scaffolding.
    private func item(_ raw: Vectors.RawItem) -> Item {
        Item(
            id: raw.id,
            name: raw.id,
            brand: nil,
            categoryId: "almacen",
            locationId: "alacena",
            tracking: Tracking(rawValue: raw.tracking) ?? .quantity,
            unit: raw.unit.flatMap(Unit.init(rawValue:)),
            quantity: raw.quantity,
            minQuantity: raw.minQuantity,
            level: raw.level,
            minLevel: raw.minLevel,
            spare: raw.spare,
            minSpare: raw.minSpare,
            autoSuggest: raw.autoSuggest,
            packSize: nil,
            barcodes: [],
            expiresAt: nil,
            snoozedUntil: raw.snoozedUntil,
            lastPriceCents: nil,
            notes: nil
        )
    }

    private func recipe(_ raw: Vectors.RawRecipe) -> Recipe {
        Recipe(
            id: raw.id,
            title: raw.id,
            icon: nil,
            servings: 2,
            steps: nil,
            tags: [],
            ingredients: raw.ingredients.map {
                Ingredient(
                    label: $0.label ?? "",
                    itemId: $0.itemId,
                    quantity: $0.quantity,
                    unit: $0.unit.flatMap(Unit.init(rawValue:)),
                    optional: $0.optional
                )
            },
            timesCooked: 0,
            lastCookedAt: nil
        )
    }

    private func plan(_ raw: Vectors.RawPlan?) -> MealPlan? {
        guard let raw else { return nil }
        return MealPlan(
            id: "2026-08-15",
            startDate: "2026-08-15",
            endDate: "2026-08-28",
            length: .fortnightly,
            days: raw.days.mapValues {
                PlanDay(
                    recipeId: $0.recipeId,
                    label: $0.label,
                    status: DayStatus(rawValue: $0.status) ?? .planned,
                    cookedAt: nil
                )
            }
        )
    }

    /// The vector file is data, so adding cases to it does not change the number
    /// of XCTest methods — this suite reports "17 tests" whether it ran 29 cases
    /// or 36. That makes a silently-skipped file indistinguishable from a
    /// passing one, which is exactly how a green suite ends up proving nothing.
    /// The count is asserted so a JSON that failed to decode, or a `cases` key
    /// this struct stopped seeing, fails loudly instead.
    ///
    /// Bump it when cases are added, and keep it equal to the TypeScript side.
    func testEveryVectorIsActuallyRun() throws {
        XCTAssertEqual(try Self.load().cases.count, 37)
    }

    func testSharedVectors() throws {
        for testCase in try Self.load().cases {
            let got = Suggestions.compute(
                Suggestions.Input(
                    today: testCase.input.today,
                    items: testCase.input.items.map(item),
                    plan: plan(testCase.input.plan),
                    recipes: testCase.input.recipes.map(recipe),
                    listItemIds: testCase.input.listItemIds
                )
            )

            let expected = testCase.expected.map {
                Suggestion(
                    itemId: $0.itemId,
                    source: ShoppingSource(rawValue: $0.source) ?? .min,
                    quantity: $0.quantity,
                    planRefs: ($0.planRefs ?? []).map { PlanRef(recipeId: $0.recipeId, date: $0.date) }
                )
            }

            XCTAssertEqual(got, expected, testCase.name)
        }
    }

    func testAvailabilityIgnoresFreeText() {
        let items = ["harina": Item(
            id: "harina", name: "Harina", brand: nil, categoryId: "almacen", locationId: "alacena",
            tracking: .level, unit: nil, quantity: nil, minQuantity: nil, level: 3, minLevel: 1,
            packSize: nil, barcodes: [], expiresAt: nil, snoozedUntil: nil, lastPriceCents: nil,
            notes: nil)]

        let recipe = Recipe(
            id: "pan", title: "Pan", icon: nil, servings: 2, steps: nil, tags: [],
            ingredients: [
                Ingredient(label: "Harina", itemId: "harina", quantity: nil, unit: nil, optional: false),
                Ingredient(label: "una pizca de sal", itemId: nil, quantity: nil, unit: nil, optional: false),
            ],
            timesCooked: 0, lastCookedAt: nil)

        let availability = RecipeAvailability.of(recipe, itemsById: items)
        XCTAssertEqual(availability, Availability(missing: 0, low: 0, unknown: false))
    }
}
