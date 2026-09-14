import SwiftUI

/// Settings, in the same shape as every other screen: a ScrollView of cards
/// under section labels.
///
/// It used to be a plain `List`, which brought UIKit's own greys — pure black
/// behind #1C1C1E rows in dark, sitting next to four screens painted with our
/// tokens. Gastos Diarios settles this the same way, so the two apps read as
/// one product.
///
/// Order follows Gastos Diarios: what you came to change is above what you came
/// to look at, the household sits near the end, and version and sign-out close
/// it. No timezone row — it is chosen once when the household is created, and
/// every date still resolves against it.
struct SettingsScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    @AppStorage(ThemePreference.key) private var themeRaw = ThemePreference.system.rawValue
    @State private var expiryAlerts = ExpiryNotifications.isEnabled
    @State private var expiryDays = ExpiryNotifications.daysAhead

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // The system titles iOS at 18, inside the scroll — never
                    // UIKit's large title, which belongs to a different system.
                    Text("Ajustes")
                        .appFont(18, .bold)
                        .padding(.bottom, 2)

                    planSection
                    preferencesSection
                    expirySection
                    catalogueSection
                    householdSection
                    aboutSection
                    signOutRow
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
            .background(Theme.ground)
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

    // MARK: - Sections

    private var planSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Plan de comidas")
            Card {
                VStack(spacing: 0) {
                    HStack {
                        Text("Largo").appFont(14, .semibold)
                        Spacer()
                        Picker("", selection: planLength) {
                            ForEach(PlanLength.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .labelsHidden()
                        .tint(Theme.primaryDeep)
                    }
                    .padding(.vertical, 11)

                    Divider().overlay(Theme.lineSoft)

                    HStack {
                        Text("Arranca el día").appFont(14, .semibold)
                        Spacer()
                        Picker("", selection: startWeekday) {
                            ForEach(0..<7, id: \.self) { Text(Self.weekdays[$0]).tag($0) }
                        }
                        .labelsHidden()
                        .tint(Theme.primaryDeep)
                    }
                    .padding(.vertical, 11)
                }
            }
            Text("Solo afecta períodos futuros: los ya armados conservan sus límites.")
                .appFont(11.5)
                .foregroundStyle(Theme.ink3)
                .padding(.horizontal, 4)
        }
    }

    /// Appearance, matching the web's control. iOS had no theme switch at all —
    /// it always followed the system, which meant the two clients disagreed
    /// about what a preference was.
    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Preferencias")
            Card {
                HStack {
                    Text("Apariencia").appFont(14, .semibold)
                    Spacer()
                    Picker("", selection: $themeRaw) {
                        ForEach(ThemePreference.allCases, id: \.self) {
                            Text($0.label).tag($0.rawValue)
                        }
                    }
                    .labelsHidden()
                    .tint(Theme.primaryDeep)
                }
                .padding(.vertical, 11)
            }
        }
    }

    private var expirySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Vencimientos")
            Card {
                VStack(spacing: 0) {
                    Toggle(isOn: $expiryAlerts) {
                        Text("Avisarme").appFont(14, .semibold)
                    }
                    .tint(Theme.primary)
                    .padding(.vertical, 9)

                    if expiryAlerts {
                        Divider().overlay(Theme.lineSoft)
                        HStack {
                            Text("Con cuántos días").appFont(14, .semibold)
                            Spacer()
                            Picker("", selection: $expiryDays) {
                                ForEach([1, 2, 3, 5, 7], id: \.self) { Text("\($0)").tag($0) }
                            }
                            .labelsHidden()
                            .tint(Theme.primaryDeep)
                        }
                        .padding(.vertical, 11)
                    }
                }
            }
            Text(
                "El aviso lo programa la app cuando corre, no un servidor: sin plan pago no hay push."
            )
            .appFont(11.5)
            .foregroundStyle(Theme.ink3)
            .padding(.horizontal, 4)
        }
    }

    private var catalogueSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Catálogo")
            Card {
                VStack(spacing: 0) {
                    catalogueRow("Ubicaciones", store.household?.locations.count ?? 0)
                    Divider().overlay(Theme.lineSoft)
                    catalogueRow("Categorías", store.household?.categories.count ?? 0)
                    Divider().overlay(Theme.lineSoft)
                    catalogueRow("Ítems", store.items.count)
                }
            }
        }
    }

    private func catalogueRow(_ title: String, _ count: Int) -> some View {
        HStack {
            Text(title).appFont(14, .semibold)
            Spacer()
            Text("\(count)")
                .appFont(14, .semibold)
                .monospacedDigit()
                .foregroundStyle(Theme.ink2)
        }
        .padding(.vertical, 11)
    }

    @ViewBuilder
    private var householdSection: some View {
        if let household = store.household {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Hogar")
                Card {
                    VStack(spacing: 0) {
                        HStack(spacing: 10) {
                            ForEach(Array(household.memberIds.enumerated()), id: \.element) {
                                index, uid in
                                Avatar(
                                    name: household.members[uid]?.displayName,
                                    colour: index == 1 ? Theme.memberB : Theme.memberA,
                                    size: 30
                                )
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(household.name).appFont(15, .bold)
                                Text(
                                    household.memberIds
                                        .compactMap { household.members[$0]?.displayName }
                                        .joined(separator: " y ")
                                        + " · \(household.memberIds.count) de 2"
                                )
                                .appFont(12)
                                .foregroundStyle(Theme.ink2)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 12)
                    }
                }
            }
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "La app")
            Card {
                VStack(spacing: 0) {
                    HStack {
                        Text("Versión").appFont(14, .semibold)
                        Spacer()
                        Text(Self.appVersion)
                            .appFont(14, .semibold)
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink2)
                    }
                    .padding(.vertical, 11)

                    if let expiry = SigningExpiry.date {
                        Divider().overlay(Theme.lineSoft)
                        signingExpiryRow(expiry).padding(.vertical, 9)
                    }

                    Divider().overlay(Theme.lineSoft)
                    Link(destination: URL(string: "https://stock.cardozo.dev")!) {
                        HStack {
                            Text("Abrir la web").appFont(14, .semibold)
                            Spacer()
                            Image(systemName: "arrow.up.forward.square")
                                .appSymbol(15)
                                .foregroundStyle(Theme.ink3)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 11)
                }
            }
        }
    }

    /// A card rather than a bare row, like Gastos Diarios: the last thing on the
    /// page looks like the others and reads as the exit.
    private var signOutRow: some View {
        Button {
            session.signOut()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .appSymbol(16, .semibold)
                Text("Cerrar sesión").appFont(14, .semibold)
                Spacer()
            }
            .foregroundStyle(Theme.dangerDeep)
            .padding(.vertical, 13)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(Theme.surface)
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))
            )
        }
        .buttonStyle(.plain)
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
                Text("La firma vence").appFont(14, .semibold)
                Text(DayFormat.long(Self.iso(expiry)))
                    .appFont(11.5)
                    .foregroundStyle(Theme.ink3)
            }
            Spacer()
            Text(
                days < 0
                    ? "vencida"
                    : days == 0 ? "hoy" : days == 1 ? "mañana" : "en \(days) días"
            )
            .appFont(13, .bold)
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
