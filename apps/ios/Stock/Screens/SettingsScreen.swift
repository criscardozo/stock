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
                    LabeledContent("Versión", value: Self.appVersion)
                        .font(.stock(14.5, .semibold))
                    if let expiry = SigningExpiry.date {
                        signingExpiryRow(expiry)
                    }
                    Link(destination: URL(string: "https://stock.cardozo.dev")!) {
                        HStack {
                            Text("Abrir la web").font(.stock(14.5, .semibold))
                            Spacer()
                            Image(systemName: "arrow.up.forward.square")
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.ink3)
                        }
                    }
                    .buttonStyle(.plain)
                } header: {
                    Text("La app")
                }

                Section {
                    Button("Cerrar sesión", role: .destructive) { session.signOut() }
                }
            }
            // A plain List brings UIKit's own greys: in dark that is pure black
            // behind #1C1C1E rows, which reads as a different app from the four
            // screens beside it. The tokens are the product; the platform default
            // is not.
            .scrollContentBackground(.hidden)
            .background(Theme.ground)
            .listRowBackground(Theme.surface)
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

    /// "0.1 (1)" from the bundle — which build is actually running.
    private static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        return "\(short) (\(build))"
    }

    /// Free-account signing lasts 7 days; say exactly when this build dies.
    /// Only rendered when a provisioning profile exists — never in the Simulator.
    private func signingExpiryRow(_ expiry: Date) -> some View {
        let days = SigningExpiry.daysRemaining() ?? 0
        let colour: Color = days < 0 || days <= 1
            ? Theme.dangerDeep
            : (days <= 2 ? Theme.primaryDeep : Theme.ink2)

        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("La firma vence").font(.stock(14.5, .semibold))
                Text(DayFormat.long(Self.iso(expiry)))
                    .font(.stock(11.5))
                    .foregroundStyle(Theme.ink3)
            }
            Spacer()
            Text(
                days < 0
                    ? "vencida"
                    : days == 0 ? "hoy" : days == 1 ? "mañana" : "en \(days) días"
            )
            .font(.stock(13, .bold))
            .foregroundStyle(colour)
        }
    }

    private static func iso(_ date: Date) -> CalendarDate.Iso {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
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
