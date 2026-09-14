import SwiftUI

struct LoginView: View {
    @Environment(Session.self) private var session

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        // Scrollable past the accessibility sizes. The headline is 30pt and
        // three lines; scaled by an accessibility category it does not fit
        // between the two Spacers on any phone, and SwiftUI's answer to that is
        // to truncate — "Qué hay en casa,…", which is the sales pitch cut in
        // half on the first screen anyone sees. Scrolling costs nothing at the
        // default size, where it never scrolls.
        ScrollView {
            content.frame(minHeight: typeSize.isAccessibilitySize ? 0 : nil)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()
            AppMark(size: 56)

            VStack(alignment: .leading, spacing: 10) {
                Text("Qué hay en casa,\nqué falta,\nqué se cocina.")
                    .appFont(30, .bold)
                    .lineSpacing(2)
                Text("El inventario y el plan de comidas, compartidos entre los dos.")
                    .appFont(15)
                    .foregroundStyle(Theme.ink2)
            }

            Spacer()

            PrimaryButton(icon: "person.crop.circle", title: "Continuar con Google") {
                Task { await session.signIn() }
            }

            if let error = session.error {
                Text(error).appFont(13).foregroundStyle(Theme.dangerDeep)
            }

            if Session.useEmulators {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Emulador")
                    HStack(spacing: 8) {
                        ForEach(["cristian@example.com", "meli@example.com"], id: \.self) { email in
                            Button(email.split(separator: "@").first.map(String.init) ?? email) {
                                Task { await session.devSignIn(email: email) }
                            }
                            .appFont(13, .semibold)
                            .foregroundStyle(Theme.ink2)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().stroke(Theme.line))
                        }
                    }
                }
                .padding(.top, 4)
            }

            Text("Google es el único proveedor, en las dos plataformas: mezclar Apple y Google crea dos cuentas distintas para la misma persona.")
                .appFont(12)
                .foregroundStyle(Theme.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
    }
}
