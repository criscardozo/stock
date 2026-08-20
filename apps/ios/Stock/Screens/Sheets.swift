import SwiftUI

/// The one place shopping changes stock. Ticking a row in the aisle is just a
/// tick; this is where what actually came in gets confirmed — in one batch that
/// also deletes those rows and leaves the unticked ones for next week.
struct CloseShoppingSheet: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var entries: [ShoppingEntry]

    @State private var amounts: [String: Int] = [:]
    @State private var levels: [String: Level] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Card {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                            let item = entry.itemId.flatMap { store.itemsById[$0] }
                            VStack(spacing: 0) {
                                HStack(spacing: 12) {
                                    Text(entry.label).font(.stock(15, .semibold))
                                    Spacer()
                                    if let item, item.tracking == .quantity {
                                        Stepper(
                                            value: amounts[entry.id] ?? 0,
                                            step: (item.unit ?? .unit).step,
                                            label: Quantities.format(
                                                amounts[entry.id] ?? 0, item.unit ?? .unit)
                                        ) { amounts[entry.id] = $0 }
                                    } else if let item, item.tracking == .level {
                                        LevelDial(
                                            level: levels[entry.id] ?? 3, showName: false
                                        ) { levels[entry.id] = $0 }
                                    } else {
                                        Text("suelto").font(.stock(12)).foregroundStyle(Theme.ink3)
                                    }
                                }
                                .padding(.vertical, 12)
                                if index != entries.count - 1 { Divider().overlay(Theme.lineSoft) }
                            }
                        }
                    }

                    Text("Lo tildado entra al stock y sale de la lista. Lo que no conseguiste queda para la próxima.")
                        .font(.stock(12))
                        .foregroundStyle(Theme.ink3)

                    PrimaryButton(icon: "checkmark", title: "Guardar y cerrar", action: confirm)
                }
                .padding(20)
            }
            .background(Theme.ground)
            .navigationTitle("Cerrar compra")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
            }
        }
        .onAppear(perform: prefill)
    }

    private func prefill() {
        for entry in entries {
            let item = entry.itemId.flatMap { store.itemsById[$0] }
            // The row's amount is only meaningful in the ITEM's unit. A row
            // written in a different one must not be added blind — "2" of a
            // millilitre item is not two tins.
            let sameUnit = entry.unit == nil || item?.unit == nil || entry.unit == item?.unit
            amounts[entry.id] = sameUnit ? (entry.quantity ?? 0) : 0
            levels[entry.id] = 3
        }
    }

    private func confirm() {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        let purchases = entries.map { entry in
            Mutations.Purchase(
                entry: entry,
                item: entry.itemId.flatMap { store.itemsById[$0] },
                quantity: amounts[entry.id] ?? 0,
                level: levels[entry.id] ?? 3,
                expiresAt: nil,
                priceCents: nil
            )
        }
        Mutations.closeShopping(householdId: householdId, uid: uid, purchases: purchases)
        dismiss()
    }
}

/// "Cocinada" proposes what the recipe says and lets the human fix it before it
/// lands — because nobody cooks exactly the recipe, and a stock that quietly
/// drifts is worse than one that asks.
struct CookSheet: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var planId: CalendarDate.Iso
    var date: CalendarDate.Iso
    var recipe: Recipe?

    @State private var enabled: [String: Bool] = [:]
    @State private var amounts: [String: Int] = [:]
    @State private var levels: [String: Level] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Destildá lo que no gastaste.")
                        .font(.stock(13))
                        .foregroundStyle(Theme.ink2)

                    if linked.isEmpty {
                        Text("Esta receta no tiene ingredientes linkeados al catálogo, así que no hay nada que descontar.")
                            .font(.stock(14))
                            .foregroundStyle(Theme.ink2)
                            .padding(16)
                            .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))
                    } else {
                        Card {
                            ForEach(Array(linked.enumerated()), id: \.offset) { index, ingredient in
                                if let itemId = ingredient.itemId, let item = store.itemsById[itemId] {
                                    VStack(spacing: 0) {
                                        HStack(spacing: 12) {
                                            Button {
                                                enabled[item.id] = !(enabled[item.id] ?? true)
                                            } label: {
                                                Image(
                                                    systemName: (enabled[item.id] ?? true)
                                                        ? "checkmark.square.fill" : "square"
                                                )
                                                .font(.system(size: 20))
                                                .foregroundStyle(
                                                    (enabled[item.id] ?? true) ? Theme.primary : Theme.ink4)
                                            }
                                            .buttonStyle(.plain)

                                            Text(item.name).font(.stock(15, .semibold))
                                            Spacer()

                                            if enabled[item.id] ?? true {
                                                if item.tracking == .quantity {
                                                    Stepper(
                                                        value: amounts[item.id] ?? 0,
                                                        step: (item.unit ?? .unit).step,
                                                        label: Quantities.format(
                                                            amounts[item.id] ?? 0, item.unit ?? .unit)
                                                    ) { amounts[item.id] = $0 }
                                                } else {
                                                    LevelDial(
                                                        level: levels[item.id] ?? 0, showName: false
                                                    ) { levels[item.id] = $0 }
                                                }
                                            } else {
                                                Text("no descontar")
                                                    .font(.stock(12))
                                                    .foregroundStyle(Theme.ink3)
                                            }
                                        }
                                        .padding(.vertical, 12)
                                        if index != linked.count - 1 {
                                            Divider().overlay(Theme.lineSoft)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    PrimaryButton(icon: "checkmark", title: "Descontar y marcar") { confirm(all: true) }
                    Button("Solo marcar cocinada") { confirm(all: false) }
                        .font(.stock(14, .semibold))
                        .foregroundStyle(Theme.ink2)
                        .frame(maxWidth: .infinity)
                }
                .padding(20)
            }
            .background(Theme.ground)
            .navigationTitle(recipe.map { "Cocinaste \($0.title)" } ?? "Marcar cocinada")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
            }
        }
        .onAppear(perform: prefill)
    }

    private var linked: [Ingredient] {
        (recipe?.ingredients ?? []).filter { $0.itemId.flatMap { store.itemsById[$0] } != nil }
    }

    private func prefill() {
        for ingredient in linked {
            guard let itemId = ingredient.itemId, let item = store.itemsById[itemId] else { continue }
            enabled[item.id] = true
            amounts[item.id] = ingredient.quantity ?? 0
            // Default: one notch down from where it is. Cooking used *some*.
            levels[item.id] = max(0, (item.level ?? 0) - 1)
        }
    }

    private func confirm(all: Bool) {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        let consumption: [Mutations.Consumption] = all
            ? linked.compactMap { ingredient in
                guard let itemId = ingredient.itemId, let item = store.itemsById[itemId],
                      enabled[item.id] ?? true
                else { return nil }
                return item.tracking == .quantity
                    ? Mutations.Consumption(item: item, quantity: amounts[item.id] ?? 0, level: nil)
                    : Mutations.Consumption(item: item, quantity: nil, level: levels[item.id] ?? 0)
            }
            : []

        Mutations.markCooked(
            householdId: householdId, uid: uid, planId: planId, date: date,
            recipe: recipe, consumption: consumption
        )
        dismiss()
    }
}

/// New item / edit item. The measurement toggle is the important control: it
/// decides which pair of fields the document may carry, and the rules reject
/// anything half-and-half.
struct ItemSheet: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var item: Item?
    /// Prefills the form when the scanner found a product nobody has yet.
    var prefill: (name: String, brand: String?, barcode: String)?

    @State private var name = ""
    @State private var nameEs = ""
    @State private var brand = ""
    @State private var categoryId = ""
    @State private var locationId = ""
    @State private var tracking = Tracking.quantity
    @State private var unit = Unit.unit
    @State private var quantity = 0
    @State private var minQuantity = 0
    @State private var level: Level = 3
    @State private var minLevel: Level = 1

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre", text: $name)
                    // Anything imported from a receipt is titled in the shop's
                    // English; this is what makes the row readable and findable.
                    TextField("Cómo le decimos en casa (opcional)", text: $nameEs)
                    TextField("Marca (opcional)", text: $brand)
                }

                Section("Dónde va") {
                    Picker("Categoría", selection: $categoryId) {
                        ForEach(sortedCategories, id: \.0) { id, category in
                            Text(category.name).tag(id)
                        }
                    }
                    Picker("Ubicación", selection: $locationId) {
                        ForEach(sortedLocations, id: \.0) { id, location in
                            Text(location.name).tag(id)
                        }
                    }
                }

                Section {
                    Picker("", selection: $tracking) {
                        Text("Se cuenta").tag(Tracking.quantity)
                        Text("Por nivel").tag(Tracking.level)
                    }
                    .pickerStyle(.segmented)

                    if tracking == .quantity {
                        Picker("Unidad", selection: $unit) {
                            ForEach(Unit.allCases, id: \.self) { Text($0.symbol).tag($0) }
                        }
                        LabeledContent("Cantidad") {
                            Stepper(
                                value: quantity, step: unit.step,
                                label: Quantities.format(quantity, unit)
                            ) { quantity = $0 }
                        }
                        LabeledContent("Mínimo") {
                            Stepper(
                                value: minQuantity, step: unit.step,
                                label: Quantities.format(minQuantity, unit)
                            ) { minQuantity = $0 }
                        }
                    } else {
                        LabeledContent("Ahora") { LevelDial(level: level) { level = $0 } }
                        LabeledContent("Avisar en") { LevelDial(level: minLevel) { minLevel = $0 } }
                    }
                } header: {
                    Text("Cómo se mide")
                } footer: {
                    Text("Enteros siempre. Lo que no se cuenta en enteros va por nivel — vacío, poco, medio, lleno — no con un decimal.")
                }
            }
            .navigationTitle(item == nil ? "Nuevo ítem" : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Guardar", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .onAppear(perform: load)
    }

    private var sortedCategories: [(String, Category)] {
        (store.household?.categories ?? [:]).sorted { $0.value.sortOrder < $1.value.sortOrder }
            .map { ($0.key, $0.value) }
    }

    private var sortedLocations: [(String, Location)] {
        (store.household?.locations ?? [:]).sorted { $0.value.sortOrder < $1.value.sortOrder }
            .map { ($0.key, $0.value) }
    }

    private func load() {
        if let item {
            name = item.name
            nameEs = item.nameEs ?? ""
            brand = item.brand ?? ""
            categoryId = item.categoryId
            locationId = item.locationId
            tracking = item.tracking
            unit = item.unit ?? .unit
            quantity = item.quantity ?? 0
            minQuantity = item.minQuantity ?? 0
            level = item.level ?? 3
            minLevel = item.minLevel ?? 1
        } else {
            name = prefill?.name ?? ""
            brand = prefill?.brand ?? ""
            categoryId = sortedCategories.first?.0 ?? ""
            locationId = sortedLocations.first?.0 ?? ""
        }
    }

    private func save() {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }

        var fields: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespaces),
            "categoryId": categoryId,
            "locationId": locationId,
            "tracking": tracking.rawValue,
        ]
        if !nameEs.trimmingCharacters(in: .whitespaces).isEmpty {
            fields["nameEs"] = nameEs.trimmingCharacters(in: .whitespaces)
        }
        if !brand.trimmingCharacters(in: .whitespaces).isEmpty {
            fields["brand"] = brand.trimmingCharacters(in: .whitespaces)
        }
        if tracking == .quantity {
            fields["unit"] = unit.rawValue
            fields["quantity"] = quantity
            fields["minQuantity"] = minQuantity
        } else {
            fields["level"] = level
            fields["minLevel"] = minLevel
        }

        if let item {
            Mutations.updateItem(
                householdId: householdId, uid: uid, itemId: item.id, patch: fields)
        } else {
            if let barcode = prefill?.barcode { fields["barcodes"] = [barcode] }
            Mutations.createItem(householdId: householdId, uid: uid, fields: fields)
        }
        dismiss()
    }
}

/// Pick a recipe, write a free label ("Afuera"), or clear the day.
struct PickMealSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var date: CalendarDate.Iso

    var body: some View {
        NavigationStack {
            List {
                Section("Sin cocinar") {
                    ForEach(["Afuera", "Sobras", "Cada uno lo suyo"], id: \.self) { label in
                        Button(label) { pick(recipeId: nil, label: label) }
                    }
                }
                Section("Recetas") {
                    ForEach(store.recipes) { recipe in
                        Button {
                            pick(recipeId: recipe.id, label: nil)
                        } label: {
                            HStack {
                                Text(recipe.title)
                                Spacer()
                                let availability = RecipeAvailability.of(
                                    recipe, itemsById: store.itemsById)
                                if availability.missing > 0 {
                                    Chip(text: "Faltan \(availability.missing)", tone: .dangerQuiet)
                                }
                            }
                        }
                    }
                }
                Section {
                    Button("Dejarlo sin plan", role: .destructive) { pick(recipeId: nil, label: nil) }
                }
            }
            .navigationTitle(DayFormat.long(date))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { dismiss() } }
            }
        }
    }

    private func pick(recipeId: String?, label: String?) {
        guard let householdId = store.householdId, let planId = store.plan?.id else { return }
        Mutations.setPlanDay(
            householdId: householdId, planId: planId, date: date,
            recipeId: recipeId, label: label
        )
        dismiss()
    }
}
