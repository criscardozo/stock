import SwiftUI

struct SettingsScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    @State private var expiryAlerts = ExpiryNotifications.isEnabled
    @State private var expiryDays = ExpiryNotifications.daysAhead

    var body: some View {
        NavigationStack {
            List {
                if let household = store.household {
                    Section("Hogar") {
                        HStack(spacing: 10) {
                            ForEach(Array(household.memberIds.enumerated()), id: \.element) { index, uid in
                                Avatar(
                                    name: household.members[uid]?.displayName,
                                    colour: index == 1 ? Theme.memberB : Theme.memberA,
                                    size: 30
                                )
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(household.name).font(.stock(16, .bold))
                                Text(
                                    household.memberIds
                                        .compactMap { household.members[$0]?.displayName }
                                        .joined(separator: " y ")
                                        + " · \(household.memberIds.count) de 2"
                                )
                                .font(.stock(12))
                                .foregroundStyle(Theme.ink2)
                            }
                        }
                        LabeledContent("Zona horaria", value: household.timezone)
                    }

                    Section {
                        Picker("Largo", selection: planLength) {
                            ForEach(PlanLength.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        Picker("Arranca", selection: startWeekday) {
                            ForEach(0..<7, id: \.self) { index in
                                Text(Self.weekdays[index]).tag(index)
                            }
                        }
                    } header: {
                        Text("Plan de comidas")
                    } footer: {
                        Text("Solo afecta períodos futuros: los ya armados conservan sus límites.")
                    }

                    Section("Catálogo") {
                        LabeledContent("Ubicaciones", value: "\(household.locations.count)")
                        LabeledContent("Categorías", value: "\(household.categories.count)")
                        LabeledContent("Ítems", value: "\(store.items.count)")
                    }
                }

                Section {
                    Toggle("Avisarme", isOn: $expiryAlerts)
                    if expiryAlerts {
                        Picker("Con cuántos días", selection: $expiryDays) {
                            ForEach([1, 2, 3, 5, 7], id: \.self) { Text("\($0)").tag($0) }
                        }
                    }
                } header: {
                    Text("Vencimientos")
                } footer: {
                    Text("El aviso lo programa la app cuando corre, no un servidor: sin plan pago no hay push. Si no abrís la app en semanas, no hay quien avise.")
                }

                Section {
                    Button("Cerrar sesión", role: .destructive) { session.signOut() }
                }
            }
            .navigationTitle("Ajustes")
            .onChange(of: expiryAlerts) { _, enabled in
                ExpiryNotifications.isEnabled = enabled
                Task { await reschedule() }
            }
            .onChange(of: expiryDays) { _, days in
                ExpiryNotifications.daysAhead = days
                Task { await reschedule() }
            }
        }
    }

    private static let weekdays = [
        "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
    ]

    private var planLength: Binding<PlanLength> {
        Binding(
            get: { store.household?.planConfig.length ?? .fortnightly },
            set: { value in
                guard let id = store.householdId else { return }
                Mutations.updateHousehold(id, ["planConfig.length": value.rawValue])
            }
        )
    }

    private var startWeekday: Binding<Int> {
        Binding(
            get: { store.household?.planConfig.startWeekday ?? 6 },
            set: { value in
                guard let id = store.householdId else { return }
                Mutations.updateHousehold(id, ["planConfig.startWeekday": value])
            }
        )
    }

    private func reschedule() async {
        await ExpiryNotifications.reschedule(items: store.items, today: store.today)
    }
}
