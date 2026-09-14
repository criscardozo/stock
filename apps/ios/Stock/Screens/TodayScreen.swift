import SwiftUI

/// What's being cooked today, its ingredients, and one button to mark it cooked.
struct TodayScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    @State private var cooking = false
    @State private var picking = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Hoy")
                        .appFont(18, .bold)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    Text(DayFormat.long(store.today))
                        .appFont(13, .semibold)
                        .foregroundStyle(Theme.ink2)
                        .padding(.horizontal, 20)

                    if let recipe = store.todaysRecipe {
                        meal(recipe)
                    } else if let label = store.todaysDay?.label {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(label).appFont(26, .bold)
                            Text("Nada que cocinar hoy.").appFont(14).foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 20)
                    } else {
                        EmptyStateView(
                            icon: "calendar",
                            title: "Hoy no hay plan",
                            message: "Elegí algo de las recetas o dejalo libre."
                        )
                        Button("Elegir una receta") { picking = true }
                            .appFont(15, .bold)
                            .foregroundStyle(Theme.primaryDeep)
                            .frame(maxWidth: .infinity)
                    }

                    if let next = tomorrow {
                        VStack(alignment: .leading, spacing: 6) {
                            SectionLabel(text: "Mañana")
                            Text(next).appFont(15, .semibold)
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
            .background(Theme.ground)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                if store.todaysRecipe != nil, store.todaysDay?.status != .cooked {
                    PrimaryButton(icon: "fork.knife", title: "Marcar cocinada") { cooking = true }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                }
            }
            .sheet(isPresented: $cooking) {
                if let planId = store.plan?.id {
                    CookSheet(planId: planId, date: store.today, recipe: store.todaysRecipe)
                }
            }
            .sheet(isPresented: $picking) { PickMealSheet(date: store.today) }
        }
    }

    @ViewBuilder private func meal(_ recipe: Recipe) -> some View {
        let availability = RecipeAvailability.of(recipe, itemsById: store.itemsById)

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(recipe.title).appFont(28, .bold)
                HStack(spacing: 14) {
                    Label("\(recipe.servings) porciones", systemImage: "person.2.fill")
                    Label("\(recipe.timesCooked) veces", systemImage: "arrow.clockwise")
                }
                .appFont(13)
                .foregroundStyle(Theme.ink2)
            }

            if store.todaysDay?.status == .cooked {
                Chip(icon: "checkmark.circle.fill", text: "Cocinada", tone: .primary)
            } else if availability.missing > 0 {
                HStack {
                    Chip(
                        text: availability.missing == 1
                            ? "Falta 1 ingrediente" : "Faltan \(availability.missing) ingredientes",
                        tone: .dangerQuiet
                    )
                    Spacer()
                    Button("A la lista") { sendMissing(recipe) }
                        .appFont(13, .bold)
                        .foregroundStyle(Theme.primaryDeep)
                }
            }

            SectionLabel(text: "Ingredientes")
            Card {
                ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { index, ingredient in
                    IngredientRow(
                        ingredient: ingredient,
                        status: RecipeAvailability.status(ingredient, itemsById: store.itemsById),
                        item: ingredient.itemId.flatMap { store.itemsById[$0] },
                        isLast: index == recipe.ingredients.count - 1
                    )
                }
            }

            if let steps = recipe.steps, !steps.isEmpty {
                SectionLabel(text: "Preparación")
                Text(steps)
                    .appFont(14)
                    .lineSpacing(4)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))
            }
        }
        .padding(.horizontal, 20)
    }

    private var tomorrow: String? {
        let date = CalendarDate.adding(1, to: store.today)
        guard let day = store.plan?.days[date] else { return nil }
        if let recipeId = day.recipeId {
            return store.recipes.first { $0.id == recipeId }?.title
        }
        return day.label
    }

    private func sendMissing(_ recipe: Recipe) {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        for ingredient in recipe.ingredients
        where !ingredient.optional
            && RecipeAvailability.status(ingredient, itemsById: store.itemsById) == .missing {
            let item = ingredient.itemId.flatMap { store.itemsById[$0] }
            var fields: [String: Any] = [
                "label": item?.name ?? ingredient.label,
                "source": ShoppingSource.plan.rawValue,
                "reason": "para \(recipe.title)",
            ]
            if let item {
                fields["itemId"] = item.id
                if item.tracking == .quantity {
                    fields["quantity"] = RecipeAvailability.shortfall(
                        ingredient, itemsById: store.itemsById)
                    if let unit = item.unit { fields["unit"] = unit.rawValue }
                }
            }
            Mutations.addToList(householdId: householdId, uid: uid, fields: fields)
        }
    }
}

struct IngredientRow: View {
    var ingredient: Ingredient
    var status: IngredientStatus
    var item: Item?
    var isLast: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .appSymbol(15, .semibold)
                    .foregroundStyle(colour)
                Text(ingredient.label).appFont(15, .semibold)
                Spacer()
                if let quantity = ingredient.quantity, let unit = ingredient.unit {
                    Text(Quantities.format(quantity, unit))
                        .appFont(13)
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink2)
                } else if status == .unlinked {
                    Text("texto libre").appFont(12).foregroundStyle(Theme.ink3)
                } else if let item, item.tracking == .level {
                    Text(Levels.name(item.level ?? 0)).appFont(12).foregroundStyle(Theme.ink2)
                }
            }
            .padding(.vertical, 10)
            if !isLast { Divider().overlay(Theme.lineSoft) }
        }
    }

    private var icon: String {
        switch status {
        case .missing: return "exclamationmark.circle.fill"
        case .low: return "arrow.down"
        case .unlinked: return "text.alignleft"
        case .have: return "checkmark.circle.fill"
        }
    }

    private var colour: Color {
        switch status {
        case .missing: return Theme.dangerDeep
        case .low: return Theme.primaryDeep
        case .unlinked: return Theme.ink4
        case .have: return Theme.primary
        }
    }
}
