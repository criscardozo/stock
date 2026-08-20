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
            // the machine's LAN address. Ports are overridable because
            // Cristian's own Docker stack has claimed 8085 and 9099 before —
            // and when it does, the app silently talks to the wrong emulator
            // and reports "no user record" as if the seed had failed.
            let authPort = Self.port(for: "-authPort", default: 9099)
            let firestorePort = Self.port(for: "-firestorePort", default: 8085)
            Auth.auth().useEmulator(withHost: "127.0.0.1", port: authPort)
            let settings = Firestore.firestore().settings
            settings.host = "127.0.0.1:\(firestorePort)"
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

    /// `-firestorePort 8299` on the launch arguments, when the defaults are taken.
    private static func port(for flag: String, default fallback: Int) -> Int {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag), i + 1 < args.count,
              let value = Int(args[i + 1])
        else { return fallback }
        return value
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
