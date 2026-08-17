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
        if Session.useEmulators {
            // The emulator suite runs as `demo-stock` (the `demo-` prefix is what
            // makes it refuse every call to a real Google service). The client has
            // to agree on the id: the emulator happily serves ANY project, so a
            // client asking for `qcris-stock` gets a second, empty database in the
            // same process — no error, just a document that never exists. Same
            // reasoning as the web's config.ts.
            let options = FirebaseOptions.defaultOptions()!
            options.projectID = "demo-stock"
            FirebaseApp.configure(options: options)

            // The simulator reaches the host as localhost; a device would need
            // the machine's LAN address.
            Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099)
            let settings = Firestore.firestore().settings
            settings.host = "127.0.0.1:8085"
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
        } else {
            FirebaseApp.configure()

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
