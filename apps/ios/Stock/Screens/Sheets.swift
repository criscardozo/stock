import FirebaseFirestore
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
                                                amounts[entry.id] ?? 0, item.unit ?? .unit),
                                            name: entry.label
                                        ) { amounts[entry.id] = $0 }
                                    } else if let item, item.minSpare != nil {
                                        // Sealed containers, so the question is
                                        // how many came home — not how much is
                                        // left in the open one.
                                        HStack(spacing: 8) {
                                            Text("sin abrir")
                                                .font(.stock(12))
                                                .foregroundStyle(Theme.ink3)
                                            Stepper(
                                                value: amounts[entry.id] ?? 0,
                                                step: 1,
                                                label: "+\(amounts[entry.id] ?? 0)",
                                                name: "\(entry.label), sin abrir"
                                            ) { amounts[entry.id] = $0 }
                                        }
                                    } else if let item, item.tracking == .level {
                                        LevelDial(
                                            level: levels[entry.id] ?? 3, showName: false,
                                            name: entry.label
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
                                                            amounts[item.id] ?? 0, item.unit ?? .unit),
                                                        name: item.name
                                                    ) { amounts[item.id] = $0 }
                                                } else {
                                                    LevelDial(
                                                        level: levels[item.id] ?? 0, showName: false,
                                                        name: item.name
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
    @State private var spare = 0
    @State private var minSpare = 0
    @State private var autoSuggest = true

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
                                label: Quantities.format(quantity, unit),
                                name: "Cantidad"
                            ) { quantity = $0 }
                        }
                        LabeledContent("Mínimo") {
                            Stepper(
                                value: minQuantity, step: unit.step,
                                label: Quantities.format(minQuantity, unit),
                                name: "Mínimo"
                            ) { minQuantity = $0 }
                        }
                    } else {
                        LabeledContent("Ahora") { LevelDial(level: level, name: "Lo que hay") { level = $0 } }
                        LabeledContent("Avisar en") { LevelDial(level: minLevel, name: "Avisar en") { minLevel = $0 } }
                        LabeledContent("Sin abrir") {
                            Stepper(value: spare, step: 1, label: "\(spare)", name: "Sin abrir") { spare = $0 }
                        }
                        LabeledContent("Tener siempre") {
                            Stepper(value: minSpare, step: 1, label: "\(minSpare)", name: "Tener siempre") { minSpare = $0 }
                        }
                    }
                } header: {
                    Text("Cómo se mide")
                } footer: {
                    Text(
                        tracking == .quantity
                            ? "Enteros siempre. Lo que no se cuenta en enteros va por nivel — vacío, poco, medio, lleno — no con un decimal."
                            : "El nivel mide la que está abierta; la reserva cuenta las cerradas. Con dos de reserva, abrir una ya pone la compra en la lista."
                    )
                }

                Section {
                    Toggle("Solo catálogo", isOn: Binding(
                        get: { !autoSuggest },
                        set: { autoSuggest = !$0 }
                    ))
                } footer: {
                    Text("Guarda los datos pero no lo pide cuando se termina. Para lo que compramos de vez en cuando. El plan lo sigue pidiendo si una comida lo necesita.")
                }

                // Only for an item that exists: a draft has no history.
                if let item, let householdId = store.householdId {
                    MoveHistorySection(householdId: householdId, item: item)
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
            spare = item.spare ?? 0
            minSpare = item.minSpare ?? 0
            autoSuggest = item.autoSuggest != false
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
        // Always written, both ways. Storing `true` costs one boolean per item
        // and buys not having to delete a field to turn the switch back on.
        // Absent still reads as on, so documents that predate it are untouched.
        fields["autoSuggest"] = autoSuggest

        if tracking == .quantity {
            fields["unit"] = unit.rawValue
            fields["quantity"] = quantity
            fields["minQuantity"] = minQuantity
        } else {
            fields["level"] = level
            fields["minLevel"] = minLevel
            // `minSpare` is the switch: without it the item behaves exactly as
            // it did before reserves existed, so an untouched field writes
            // nothing rather than a zero that means the same thing.
            if minSpare > 0 {
                fields["spare"] = spare
                fields["minSpare"] = minSpare
            } else if item != nil {
                // `updateData` merges, so a reserve turned OFF is invisible
                // unless the removal is stated — the item would keep a minimum
                // this form is no longer showing. Only on edit: there is
                // nothing to delete on a document that does not exist yet.
                fields["spare"] = FieldValue.delete()
                fields["minSpare"] = FieldValue.delete()
            }
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

/// What happened to one item, inside its edit sheet.
///
/// The mirror of the web's `MoveHistory`: `moves` is written on every purchase,
/// every meal cooked and every adjustment by both clients, and was read by
/// neither. Fetched once when the section appears, never listened to — the
/// collection grows forever.
struct MoveHistorySection: View {
    @Environment(Store.self) private var store

    var householdId: String
    var item: Item

    @State private var moves: [Move]?
    @State private var failed = false

    var body: some View {
        Section("Últimos movimientos") {
            if failed {
                Text("No pude leer el historial.")
                    .font(.stock(12))
                    .foregroundStyle(Theme.ink3)
            } else if let moves {
                if moves.isEmpty {
                    Text("Todavía no se movió desde que está en la casa.")
                        .font(.stock(12))
                        .foregroundStyle(Theme.ink3)
                } else {
                    ForEach(moves) { move in
                        row(move)
                    }
                }
            } else {
                Text("Buscando…")
                    .font(.stock(12))
                    .foregroundStyle(Theme.ink3)
            }
        }
        .task {
            do {
                moves = try await Mutations.recentMoves(householdId: householdId, itemId: item.id)
            } catch {
                // A history that cannot be read is not a broken item sheet.
                failed = true
            }
        }
    }

    private func row(_ move: Move) -> some View {
        HStack(spacing: 12) {
            Image(systemName: Self.icon(move.type))
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink2)
                .frame(width: 26, height: 26)
                .background(Theme.ground, in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(Self.label(move.type))
                    .font(.stock(13, .semibold))
                Text(subtitle(move))
                    .font(.stock(11.5))
                    .foregroundStyle(Theme.ink3)
            }

            Spacer(minLength: 8)

            Text(amount(move))
                .font(.stock(13, .bold))
                .monospacedDigit()
        }
    }

    private func subtitle(_ move: Move) -> String {
        let who = store.household?.members[move.by]?.displayName ?? "alguien"
        guard let at = move.at else { return "recién · \(who)" }
        return "\(Self.day.string(from: at)) · \(who)"
    }

    /// What the move did, in the item's own terms.
    private func amount(_ move: Move) -> String {
        if let to = move.levelTo {
            guard let from = move.levelFrom else { return "a \(Levels.name(to))" }
            return "\(Levels.name(from)) → \(Levels.name(to))"
        }
        guard let delta = move.delta, delta != 0 else { return "—" }
        // The sign is the whole message: "+9 u" and "−9 u" are opposite events,
        // and a bare "9 u" reads as a level.
        let sign = delta > 0 ? "+" : "−"
        return sign + Quantities.format(abs(delta), item.unit ?? .unit)
    }

    private static let day: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.setLocalizedDateFormatFromTemplate("d MMM")
        return formatter
    }()

    private static func label(_ type: MoveType) -> String {
        switch type {
        case .purchase: "Compra"
        case .cook: "Cocina"
        case .adjust: "Ajuste"
        case .waste: "Se tiró"
        }
    }

    private static func icon(_ type: MoveType) -> String {
        switch type {
        case .purchase: "cart"
        case .cook: "fork.knife"
        case .adjust: "slider.horizontal.3"
        case .waste: "trash"
        }
    }
}
