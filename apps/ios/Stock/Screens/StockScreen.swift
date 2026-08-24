import SwiftUI

/// Standing in front of the fridge: search, filter, and change a number without
/// opening anything.
struct StockScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    @State private var search = ""
    @State private var locationId: String?
    @State private var scanning = false
    @State private var editing: Item?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14, pinnedViews: []) {
                    // The title lives in the scroll at 18, not in UIKit's large
                    // title bar — that bar belongs to a different design system.
                    Text("Stock")
                        .font(.stock(18, .bold))
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    Text(summary)
                        .font(.stock(13))
                        .foregroundStyle(Theme.ink2)
                        .padding(.horizontal, 20)
                    searchField
                    filters
                    ForEach(groups, id: \.id) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: group.name)
                            Card {
                                ForEach(Array(group.items.enumerated()), id: \.element.id) { index, item in
                                    ItemRow(
                                        item: item,
                                        category: store.household?.categories[item.categoryId],
                                        location: store.household?.locations[item.locationId],
                                        today: store.today,
                                        wantedByPlan: plannedItemIds.contains(item.id),
                                        isLast: index == group.items.count - 1,
                                        onQuantity: { adjust(item, quantity: $0) },
                                        onLevel: { adjust(item, level: $0) },
                                        onOpen: { editing = item }
                                    )
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    if visible.isEmpty {
                        EmptyStateView(
                            icon: store.items.isEmpty ? "shippingbox" : "line.3.horizontal.decrease.circle",
                            title: store.items.isEmpty ? "Todavía no hay nada" : "Nada con esos filtros",
                            message: store.items.isEmpty
                                ? "Empezá por la heladera: diez ítems alcanzan para que la lista del súper sirva."
                                : "Probá sacando algún filtro o buscando otra cosa."
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
            .background(Theme.ground)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { scanning = true } label: { Image(systemName: "barcode.viewfinder") }
                    Button { creating = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $scanning) { ScannerScreen() }
            .sheet(item: $editing) { item in ItemSheet(item: item) }
            .sheet(isPresented: $creating) { ItemSheet(item: nil) }
        }
    }

    /// Our own field rather than `.searchable`. That modifier renders into the
    /// navigation bar, so with an inline title it sits ABOVE the screen title —
    /// search before you know what you are looking at. This keeps the order the
    /// design draws: title, summary, search, filters.
    private var searchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink3)
            TextField("Buscar en la casa", text: $search)
                .font(.stock(15))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
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

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                FilterPill(title: "Todo", active: locationId == nil) { locationId = nil }
                ForEach(sortedLocations, id: \.0) { id, location in
                    FilterPill(title: location.name, active: locationId == id) {
                        locationId = locationId == id ? nil : id
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var sortedLocations: [(String, Location)] {
        (store.household?.locations ?? [:]).sorted { $0.value.sortOrder < $1.value.sortOrder }
            .map { ($0.key, $0.value) }
    }

    private var summary: String {
        let counts = store.items.reduce(into: (out: 0, low: 0)) { result, item in
            switch ItemState.stock(item) {
            case .out: result.out += 1
            case .low: result.low += 1
            case .ok: break
            }
        }
        return "\(store.items.count) ítems · \(counts.out) faltan · \(counts.low) poco"
    }

    private var plannedItemIds: Set<String> {
        Set(store.suggestions.filter { !$0.planRefs.isEmpty }.map(\.itemId))
    }

    private var visible: [Item] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.items
            .filter { locationId == nil || $0.locationId == locationId }
            .filter {
                needle.isEmpty
                    // The Spanish name is searchable too: a product imported
                    // from a receipt is titled in the shop's English, and
                    // "leche" has to find it.
                    || "\($0.name) \($0.nameEs ?? "") \($0.brand ?? "")"
                        .lowercased()
                        .contains(needle)
            }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private struct Group {
        var id: String
        var name: String
        var items: [Item]
    }

    private var groups: [Group] {
        let categories = (store.household?.categories ?? [:])
            .sorted { $0.value.sortOrder < $1.value.sortOrder }
        var buckets: [String: [Item]] = [:]
        for item in visible { buckets[item.categoryId, default: []].append(item) }

        var out = categories.compactMap { id, category -> Group? in
            guard let items = buckets[id] else { return nil }
            return Group(id: id, name: category.name, items: items)
        }
        // Items whose category was deleted still have to be reachable.
        for (id, items) in buckets where store.household?.categories[id] == nil {
            out.append(Group(id: id, name: "Sin categoría", items: items))
        }
        return out
    }

    private func adjust(_ item: Item, quantity: Int? = nil, level: Level? = nil) {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        Mutations.adjustStock(
            householdId: householdId, uid: uid, item: item, quantity: quantity, level: level)
    }
}

struct FilterPill: View {
    var title: String
    var active: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.stock(13, active ? .bold : .semibold))
                // On `ink`, not on white: in dark the ink token IS the light one,
                // so a fixed white here is white on white.
                .foregroundStyle(active ? Theme.ground : Theme.ink2)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(active ? Theme.ink : Theme.surface)
                        .overlay(Capsule().stroke(active ? .clear : Theme.line))
                )
        }
        .buttonStyle(.plain)
    }
}

/// One item, one row — the catalogue and the stock are the same document, so the
/// row that tells you what you have is also the row you change it in.
struct ItemRow: View {
    var item: Item
    var category: Category?
    var location: Location?
    var today: CalendarDate.Iso
    var wantedByPlan: Bool
    var isLast: Bool
    var onQuantity: (Int) -> Void
    var onLevel: (Level) -> Void
    var onOpen: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                HueBadge(icon: category?.icon ?? "inventory_2", hue: category?.hue)

                Button(action: onOpen) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).font(.stock(15, .semibold)).foregroundStyle(Theme.ink)
                        subtitle
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                if item.tracking == .quantity {
                    Stepper(
                        value: item.quantity ?? 0,
                        step: (item.unit ?? .unit).step,
                        label: Quantities.format(item.quantity ?? 0, item.unit ?? .unit),
                        onChange: onQuantity
                    )
                } else {
                    LevelDial(level: item.level ?? 0, onChange: onLevel)
                }
            }
            .padding(.vertical, 10)

            if !isLast { Divider().overlay(Theme.lineSoft) }
        }
    }

    @ViewBuilder private var subtitle: some View {
        let stock = ItemState.stock(item)
        let expiry = ItemState.expiry(item, today: today)

        if stock == .out, item.autoSuggest == false {
            // "Falta" is a call to action, so it is only true when running out
            // is a problem to solve. A catalogue-only item at zero is simply
            // not in the house right now, and it will never reach the list on
            // its own — red would be promising something that never comes.
            label("shippingbox", "Sin stock · solo catálogo", Theme.ink2)
        } else if stock == .out {
            label("exclamationmark.circle.fill", "Falta · mínimo \(minimum)", Theme.dangerDeep)
        } else if expiry == .expired {
            label("xmark.octagon.fill", "Vencido", Theme.dangerDeep)
        } else if expiry == .expiring {
            let days = CalendarDate.daysBetween(today, item.expiresAt ?? today)
            label("clock", days == 0 ? "Vence hoy" : "Vence en \(days) d", Theme.ink2)
        } else if stock == .low, item.autoSuggest == false {
            label("shippingbox", "Queda poco · solo catálogo", Theme.ink2)
        } else if stock == .low {
            label("arrow.down", "Poco · mínimo \(minimum)", Theme.primaryDeep)
        } else if wantedByPlan {
            label("fork.knife", "Lo pide el plan", Theme.ink2)
        } else {
            // The Spanish name leads when there is nothing urgent to say. When
            // there IS — out of stock, going off — the state wins the line: this
            // screen is read standing in front of the fridge, and what is
            // missing matters more than what a product is called.
            // The reserve leads when there is one: seeing "1 de 2 sin abrir"
            // in front of the cupboard is the whole reason it is counted.
            Text(
                [reserve, item.nameEs, location?.name, item.packSize]
                    .compactMap { $0 }
                    .joined(separator: " · ")
            )
            .font(.stock(12))
            .foregroundStyle(Theme.ink3)
        }
    }

    private func label(_ icon: String, _ text: String, _ colour: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(.stock(12, .semibold))
        }
        .foregroundStyle(colour)
    }

    private var reserve: String? {
        guard let minSpare = item.minSpare else { return nil }
        return "\(item.spare ?? 0) de \(minSpare) sin abrir"
    }

    private var minimum: String {
        item.tracking == .quantity
            ? Quantities.format(item.minQuantity ?? 0, item.unit ?? .unit)
            : Levels.name(item.minLevel ?? 1)
    }
}
