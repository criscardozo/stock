import SwiftUI

struct OnboardingView: View {
    @Environment(Session.self) private var session

    @State private var name = "Casa"
    @State private var timezone = "Australia/Sydney"
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    private let timezones = [
        "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
        "America/Argentina/Buenos_Aires",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    AppMark(size: 44)
                    Text("Tu hogar").font(.stock(26, .bold))
                    Text("Creá uno nuevo o entrá con el código que te pasaron.")
                        .font(.stock(14))
                        .foregroundStyle(Theme.ink2)
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel(text: "Ya tienen uno")
                    TextField("Código de invitación", text: $code)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.stock(16, .semibold))
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.ground))
                    PrimaryButton(title: "Unirme") { join() }
                        .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))

                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel(text: "Empezar de cero")
                    TextField("Nombre", text: $name)
                    LimitNote(value: name, limit: FieldLimits.householdName)
                        .font(.stock(16, .semibold))
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.ground))
                    Picker("Zona horaria", selection: $timezone) {
                        ForEach(timezones, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.ink)
                    Text("Las fechas del plan se calculan en esta zona, no en la del dispositivo.")
                        .font(.stock(12))
                        .foregroundStyle(Theme.ink3)
                    PrimaryButton(title: "Crear hogar") { create() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || busy
                            || FieldLimits.overBy(name, FieldLimits.householdName) > 0)
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))

                if let error {
                    Text(error).font(.stock(13)).foregroundStyle(Theme.dangerDeep)
                }

                Text("Un hogar tiene dos miembros como máximo. El tercero lo rechazan las reglas, no la app.")
                    .font(.stock(12))
                    .foregroundStyle(Theme.ink3)

                Button("Salir") { session.signOut() }
                    .font(.stock(13))
                    .foregroundStyle(Theme.ink3)
            }
            .padding(20)
        }
    }

    private var displayName: String {
        session.user?.displayName ?? "Sin nombre"
    }

    private func create() {
        guard let uid = session.user?.uid else { return }
        run {
            _ = try await Mutations.createHousehold(
                uid: uid, displayName: displayName,
                name: name.trimmingCharacters(in: .whitespaces), timezone: timezone
            )
        }
    }

    private func join() {
        guard let uid = session.user?.uid else { return }
        run {
            try await Mutations.joinHousehold(uid: uid, displayName: displayName, code: code)
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do { try await work() } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
