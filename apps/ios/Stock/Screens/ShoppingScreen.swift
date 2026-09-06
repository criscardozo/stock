import SwiftUI
import UIKit

/// Supermarket mode: big tap targets, tick as you walk, close the shop on the
/// way out. Both phones update live, so two people can split the aisles.
struct ShoppingScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    @State private var closing = false
    @State private var manual = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    Text("Falta")
                        .font(.stock(18, .bold))
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    if !store.list.isEmpty { progress }

                    ForEach(sections, id: \.id) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: section.name)
                            Card {
                                ForEach(Array(section.rows.enumerated()), id: \.element.id) { index, entry in
                                    ShoppingRow(
                                        entry: entry,
                                        category: category(for: entry),
                                        memberName: store.household?.members[entry.addedBy]?.displayName,
                                        memberColour: colour(for: entry.addedBy),
                                        isLast: index == section.rows.count - 1,
                                        onToggle: { toggle(entry) },
                                        onRemove: { remove(entry) }
                                    )
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    addRow

                    if !store.orderedSuggestions.isEmpty { suggestions }

                    if store.list.isEmpty && store.suggestions.isEmpty {
                        EmptyStateView(
                            icon: "checkmark.circle.fill",
                            title: "Nada que comprar",
                            message: "Todo por encima del mínimo y la quincena cubierta."
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
                if !checked.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Cerrar compra") { closing = true }
                            .font(.stock(15, .bold))
                    }
                }
            }
            .sheet(isPresented: $closing) { CloseShoppingSheet(entries: checked) }
        }
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("En el changuito").font(.stock(13, .semibold)).foregroundStyle(Theme.ink2)
                Spacer()
                Text("\(checked.count) de \(store.list.count)")
                    .font(.stock(13)).monospacedDigit().foregroundStyle(Theme.ink3)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.neutralSoft)
                    Capsule().fill(Theme.primary)
                        .frame(width: geometry.size.width * fraction)
                }
            }
            .frame(height: 10)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))
        .padding(.horizontal, 16)
    }

    private var addRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "plus.circle").foregroundStyle(Theme.ink3)
                TextField("Agregar algo suelto…", text: $manual)
                    .font(.stock(15))
                    .onSubmit(addManual)
                // The button leaves rather than going grey: there is nothing
                // else in this row to explain a disabled control, and the note
                // below takes its place.
                if !manual.trimmingCharacters(in: .whitespaces).isEmpty,
                   FieldLimits.overBy(manual, FieldLimits.shoppingLabel) == 0 {
                    Button("Agregar", action: addManual)
                        .accessibilityLabel("Agregar a la lista")
                        .font(.stock(13, .bold))
                        .foregroundStyle(Theme.primaryDeep)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Theme.lineStrong, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            )

            LimitNote(value: manual, limit: FieldLimits.shoppingLabel)
                .padding(.horizontal, 4)
        }
        .padding(.horizontal, 16)
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(text: "Sugerencias (\(store.orderedSuggestions.count))")
                Spacer()
                Button("Agregar todo") { store.orderedSuggestions.forEach(add) }
                    .font(.stock(13, .semibold))
                    .foregroundStyle(Theme.ink2)
            }
            Card {
                ForEach(Array(store.orderedSuggestions.enumerated()), id: \.element.id) { index, suggestion in
                    if let item = store.itemsById[suggestion.itemId] {
                        VStack(spacing: 0) {
                            HStack(spacing: 12) {
                                HueBadge(
                                    icon: store.household?.categories[item.categoryId]?.icon ?? "inventory_2",
                                    hue: store.household?.categories[item.categoryId]?.hue
                                )
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name).font(.stock(15, .semibold))
                                    Text(reason(for: suggestion, item: item))
                                        .font(.stock(12))
                                        .foregroundStyle(Theme.ink2)
                                }
                                Spacer()
                                if let quantity = suggestion.quantity {
                                    Text(Quantities.format(quantity, item.unit ?? .unit))
                                        .font(.stock(13, .bold))
                                        .monospacedDigit()
                                }
                                Button { add(suggestion) } label: {
                                    Text("Agregar")
                                        .font(.stock(12, .bold))
                                        .foregroundStyle(Theme.primaryDeep)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(Capsule().fill(Theme.primarySoft))
                                }
                                .buttonStyle(.plain)
                                // Named by what it adds. The web twin of this row had twelve buttons
                                // called "Agregar", told apart on screen by the row they sit in and by
                                // nothing at all otherwise. Fixed there first; this is the same list.
                                .accessibilityLabel("Agregar \(item.name)")
                            }
                            .padding(.vertical, 10)
                            if index != store.orderedSuggestions.count - 1 {
                                Divider().overlay(Theme.lineSoft)
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Data

    private var checked: [ShoppingEntry] { store.list.filter(\.checked) }
    private var fraction: Double {
        store.list.isEmpty ? 0 : Double(checked.count) / Double(store.list.count)
    }

    private struct Section {
        var id: String
        var name: String
        var rows: [ShoppingEntry]
    }

    private var sections: [Section] {
        let categories = (store.household?.categories ?? [:])
            .sorted { $0.value.sortOrder < $1.value.sortOrder }
        var buckets: [String: [ShoppingEntry]] = [:]
        for entry in store.list {
            let key = entry.itemId.flatMap { store.itemsById[$0]?.categoryId } ?? "__manual"
            buckets[key, default: []].append(entry)
        }
        var out = categories.compactMap { id, category -> Section? in
            guard let rows = buckets[id] else { return nil }
            return Section(id: id, name: category.name, rows: rows)
        }
        if let manual = buckets["__manual"] {
            out.append(Section(id: "__manual", name: "Agregado a mano", rows: manual))
        }
        return out
    }

    private func category(for entry: ShoppingEntry) -> Category? {
        guard let itemId = entry.itemId, let item = store.itemsById[itemId] else { return nil }
        return store.household?.categories[item.categoryId]
    }

    private func colour(for uid: String) -> Color {
        (store.household?.memberIds.firstIndex(of: uid) ?? 0) == 1 ? Theme.memberB : Theme.memberA
    }

    private func reason(for suggestion: Suggestion, item: Item) -> String {
        Suggestions.reason(
            for: suggestion, item: item, recipes: store.recipes,
            formatDay: { DayFormat.short($0) }
        )
    }

    // MARK: - Writes

    private func toggle(_ entry: ShoppingEntry) {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        // A tap you can feel: this screen gets used one-handed, walking, with
        // the phone barely in view. Gastos Diarios does the same on entry.
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Mutations.setChecked(
            householdId: householdId, uid: uid, entryId: entry.id, checked: !entry.checked)
    }

    private func remove(_ entry: ShoppingEntry) {
        guard let householdId = store.householdId else { return }
        Mutations.removeFromList(householdId: householdId, entryId: entry.id)
    }

    private func addManual() {
        let label = manual.trimmingCharacters(in: .whitespaces)
        guard !label.isEmpty, let householdId = store.householdId, let uid = session.user?.uid
        else { return }
        Mutations.addToList(
            householdId: householdId, uid: uid,
            fields: ["label": label, "source": ShoppingSource.manual.rawValue]
        )
        manual = ""
    }

    private func add(_ suggestion: Suggestion) {
        guard let householdId = store.householdId, let uid = session.user?.uid,
              let item = store.itemsById[suggestion.itemId]
        else { return }

        var fields: [String: Any] = [
            "label": item.name,
            "itemId": item.id,
            "source": suggestion.source.rawValue,
            "reason": reason(for: suggestion, item: item),
        ]
        if let quantity = suggestion.quantity { fields["quantity"] = quantity }
        if let unit = item.unit { fields["unit"] = unit.rawValue }

        Mutations.addToList(householdId: householdId, uid: uid, fields: fields)
    }
}

struct ShoppingRow: View {
    var entry: ShoppingEntry
    var category: Category?
    var memberName: String?
    var memberColour: Color
    var isLast: Bool
    var onToggle: () -> Void
    var onRemove: () -> Void

    /// Same reasoning as the stepper's: the tick is the most-used control in
    /// the app and its whole content is a glyph.
    @ScaledMetric(relativeTo: .footnote) private var tickSide: CGFloat = 26

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: onToggle) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(entry.checked ? Theme.primary : .clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(entry.checked ? .clear : Theme.lineStrong, lineWidth: 2)
                        )
                        .overlay(
                            Image(systemName: "checkmark")
                                .font(.stockSymbol(13, .bold))
                                .foregroundStyle(Theme.onPrimary)
                                .opacity(entry.checked ? 1 : 0)
                        )
                        .frame(width: tickSide, height: tickSide)
                }
                .buttonStyle(.plain)
                // The same words the web uses, so the two apps read the same to
                // someone who moves between them. A tick is shared state — the
                // row that carries one offers to undo it — and the label has to
                // say which of the two it is doing, because the shape alone
                // does not survive being read aloud.
                .accessibilityLabel(
                    entry.checked ? "Destildar \(entry.label)" : "Tildar \(entry.label)"
                )
                .accessibilityAddTraits(entry.checked ? .isSelected : [])

                HueBadge(icon: category?.icon ?? "inventory_2", hue: category?.hue, size: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.label)
                        .font(.stock(15, .semibold))
                        .strikethrough(entry.checked)
                    Text(entry.reason ?? (entry.source == .manual ? "lo agregó \(memberName ?? "alguien")" : ""))
                        .font(.stock(12))
                        .foregroundStyle(Theme.ink2)
                }

                Spacer()

                if entry.pending {
                    Image(systemName: "icloud.slash")
                        .font(.stockSymbol(13, .semibold))
                        .foregroundStyle(Theme.ink3)
                        .accessibilityLabel("Todavía no subió")
                }

                if let quantity = entry.quantity {
                    Text(Quantities.format(quantity, entry.unit ?? .unit))
                        .font(.stock(13, .bold))
                        .monospacedDigit()
                }
                if entry.source == .manual {
                    Avatar(name: memberName, colour: memberColour, size: 22)
                }
            }
            .opacity(entry.checked ? 0.5 : 1)
            .padding(.vertical, 11)
            .swipeActions { Button("Sacar", role: .destructive, action: onRemove) }

            if !isLast { Divider().overlay(Theme.lineSoft) }
        }
    }
}

enum DayFormat {
    private static let shortFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEE d"
        return formatter
    }()

    private static let longFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEEE d 'de' MMMM"
        return formatter
    }()

    private static func date(_ iso: CalendarDate.Iso) -> Date {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: iso) ?? Date()
    }

    /// `"2026-08-19"` → `"mié 19"`. UTC is correct as the display zone BECAUSE
    /// the input is already a calendar date in the household's zone.
    static func short(_ iso: CalendarDate.Iso) -> String {
        shortFormatter.string(from: date(iso)).replacingOccurrences(of: ".", with: "")
    }

    static func long(_ iso: CalendarDate.Iso) -> String {
        longFormatter.string(from: date(iso)).capitalizedFirst
    }
}

extension String {
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
