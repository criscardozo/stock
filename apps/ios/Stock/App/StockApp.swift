import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import GoogleSignIn
import SwiftUI

@main
struct StockApp: App {
    @State private var session: Session
    @State private var store = Store()

    init() {
        FirebaseApp.configure()

        if Session.useEmulators {
            // The simulator reaches the host as localhost; a device would need
            // the machine's LAN address.
            Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099)
            let settings = Firestore.firestore().settings
            settings.host = "127.0.0.1:8085"
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
        } else {
            // Offline persistence: the supermarket is exactly where there is no
            // signal, and a warm launch should cost no reads.
            let settings = Firestore.firestore().settings
            settings.cacheSettings = PersistentCacheSettings()
            Firestore.firestore().settings = settings
        }

        _session = State(initialValue: Session())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(store)
                .tint(Theme.primary)
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}
