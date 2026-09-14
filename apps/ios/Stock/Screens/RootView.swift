import SwiftUI

struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @AppStorage(ThemePreference.key) private var themeRaw = ThemePreference.system.rawValue

    var body: some View {
        Group {
            if !session.ready {
                // Waiting for the auth state. Rendering the login here is the
                // classic flash of "signed out" on every launch.
                ProgressView().tint(Theme.ink3)
            } else if session.user == nil {
                LoginView()
            } else if store.household == nil {
                OnboardingView()
            } else {
                MainTabs()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // A READ that failed, as a band and not an alert. The two failures are
        // different in kind: a refused write means the screen is showing
        // something that exists nowhere, which has to interrupt; a failed read
        // means the screen may simply be showing less than there is, and the
        // cache underneath it is often still worth using. What it must not do
        // is stay quiet, because an empty list and an unread one look the same.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let message = store.loadError {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.exclamationmark")
                        .appSymbol(13, .semibold)
                    Text("No pude leer los datos. \(message)")
                        .appFont(12, .semibold)
                        .lineLimit(2)
                }
                .foregroundStyle(Theme.ground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(Theme.dangerDeep)
            }
        }
        .background(Theme.ground)
        .preferredColorScheme(ThemePreference(rawValue: themeRaw)?.colorScheme)
        .onChange(of: session.user?.uid, initial: true) { _, uid in
            if let uid { store.start(uid: uid) } else { store.stop() }
        }
        // A write the server REFUSED. An alert and not a banner on purpose: the
        // local cache is already showing the change as applied, so the app is
        // lying until this is read. Offline never lands here — Firestore queues
        // those writes rather than failing them.
        .alert(
            "No se pudo guardar",
            isPresented: Binding(
                get: { store.writeError != nil },
                set: { if !$0 { store.writeError = nil } }
            )
        ) {
            Button("Entendido", role: .cancel) { store.writeError = nil }
        } message: {
            Text(store.writeError ?? "")
        }
    }
}

enum Tab: String {
    case stock, falta, hoy, recetas, ajustes
}

struct MainTabs: View {
    @Environment(Store.self) private var store
    // `-tab falta` at launch opens straight into a screen. A deep link would
    // do it too, but the simulator asks for confirmation on those, which is
    // exactly one tap more than a screenshot pass can afford.
    @State private var tab = Tab(
        rawValue: ProcessInfo.processInfo.arguments.last ?? ""
    ) ?? .stock

    var body: some View {
        TabView(selection: $tab) {
            StockScreen()
                .tabItem { Label("Stock", systemImage: "shippingbox.fill") }
                .tag(Tab.stock)

            ShoppingScreen()
                .tabItem { Label("Falta", systemImage: "cart.fill") }
                .badge(store.list.filter { !$0.checked }.count + store.suggestions.count)
                .tag(Tab.falta)

            TodayScreen()
                .tabItem { Label("Hoy", systemImage: "fork.knife") }
                .tag(Tab.hoy)

            RecipesScreen()
                .tabItem { Label("Recetas", systemImage: "book.closed.fill") }
                .tag(Tab.recetas)

            SettingsScreen()
                .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
                .tag(Tab.ajustes)
        }
        // `xcrun simctl openurl booted stock://falta` — how a screen gets looked
        // at during development without tapping through the app.
        .onOpenURL { url in
            guard url.scheme == "stock", let host = url.host(),
                  let destination = Tab(rawValue: host)
            else { return }
            tab = destination
        }
    }
}

struct EmptyStateView: View {
    var icon: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .appSymbol(34)
                .foregroundStyle(Theme.ink3)
            Text(title).appFont(17, .bold)
            Text(message)
                .appFont(14)
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 46)
        .padding(.horizontal, 28)
    }
}
