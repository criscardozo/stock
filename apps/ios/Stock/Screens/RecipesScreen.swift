import SwiftUI

/// Read-mostly, for cooking from the phone. Writing recipes is a sit-down job,
/// so the editor lives on the web.
struct RecipesScreen: View {
    @Environment(Store.self) private var store

    @State private var search = ""
    @State private var filter = Filter.all
    @State private var open: Recipe?

    enum Filter: String, CaseIterable {
        case all = "Todas"
        case cookable = "Se puede hoy"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    Text("Recetas")
                        .appFont(18, .bold)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    recipeSearchField
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Filter.allCases, id: \.self) { option in
                                FilterPill(title: option.rawValue, active: filter == option) {
                                    filter = option
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    ForEach(visible) { recipe in
                        Button { open = recipe } label: { card(recipe) }
                            .buttonStyle(.plain)
                    }

                    if visible.isEmpty {
                        EmptyStateView(
                            icon: "book.closed",
                            title: "Sin recetas",
                            message: "Para escribir recetas, la web."
                        )
                    }
                }
                .padding(.vertical, 8)
            }
            .background(Theme.ground)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $open) { recipe in RecipeDetailSheet(recipe: recipe) }
        }
    }

    private func card(_ recipe: Recipe) -> some View {
        let availability = RecipeAvailability.of(recipe, itemsById: store.itemsById)

        return HStack(spacing: 12) {
            HueBadge(icon: recipe.icon ?? "restaurant", hue: "green", size: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(recipe.title).appFont(16, .bold)
                Text("\(recipe.servings) porciones · \(recipe.timesCooked) veces")
                    .appFont(12)
                    .foregroundStyle(Theme.ink2)
            }
            Spacer()
            if availability.unknown {
                Chip(icon: "link", text: "Sin linkear")
            } else if availability.missing > 0 {
                Chip(
                    text: availability.missing == 1 ? "Falta 1" : "Faltan \(availability.missing)",
                    tone: .dangerQuiet
                )
            } else {
                Chip(icon: "checkmark.circle.fill", text: "Todo", tone: .primary)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(Theme.surface)
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))
        )
        .padding(.horizontal, 16)
    }

    /// Same reason as StockScreen: `.searchable` renders into the navigation bar,
    /// which puts search above the title once the title is inline.
    private var recipeSearchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .appSymbol(15, .semibold)
                .foregroundStyle(Theme.ink3)
            TextField("Buscar", text: $search)
                .appFont(15)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .appSymbol(15)
                        .foregroundStyle(Theme.ink3)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Capsule().fill(Theme.surface).overlay(Capsule().stroke(Theme.line)))
        .padding(.horizontal, 20)
    }

    private var visible: [Recipe] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.recipes
            .filter { needle.isEmpty || $0.title.lowercased().contains(needle) }
            .filter {
                filter == .all
                    || RecipeAvailability.of($0, itemsById: store.itemsById).missing == 0
            }
            .sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }
}

struct RecipeDetailSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var recipe: Recipe

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        Label("\(recipe.servings) porciones", systemImage: "person.2.fill")
                        Label("\(recipe.timesCooked) veces", systemImage: "arrow.clockwise")
                    }
                    .appFont(13)
                    .foregroundStyle(Theme.ink2)

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

                    Text("Los ingredientes de texto libre no generan faltantes: inventar «250 g de sal» sería peor que no decir nada.")
                        .appFont(12)
                        .foregroundStyle(Theme.ink3)
                }
                .padding(20)
            }
            .background(Theme.ground)
            .navigationTitle(recipe.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Listo") { dismiss() }
                }
            }
        }
    }
}
