import SwiftUI

struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

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
        .background(Theme.ground)
        .onChange(of: session.user?.uid, initial: true) { _, uid in
            if let uid { store.start(uid: uid) } else { store.stop() }
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

/// Title, one line of arithmetic about what you're looking at, and the actions.
struct ScreenHeader<Actions: View>: View {
    var title: String
    var summary: String
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.stock(28, .bold))
                Text(summary).font(.stock(13)).foregroundStyle(Theme.ink2)
            }
            Spacer()
            actions
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}

struct EmptyStateView: View {
    var icon: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundStyle(Theme.ink3)
            Text(title).font(.stock(17, .bold))
            Text(message)
                .font(.stock(14))
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 46)
        .padding(.horizontal, 28)
    }
}
