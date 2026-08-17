import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation
import GoogleSignIn
import SwiftUI

/// Auth, and the one place the emulator switch lives.
///
/// Google is the only provider on both platforms: mixing Apple and Google
/// creates two distinct Firebase UIDs for the same person, and the household
/// caps at two members.
@Observable
final class Session {
    private(set) var user: User?
    /// Until this is true we know nothing — render neither the app nor the login.
    private(set) var ready = false
    private(set) var error: String?

    private var handle: AuthStateDidChangeListenerHandle?

    /// Pass `-useEmulators` (scheme argument) or set USE_FIREBASE_EMULATORS=1.
    static var useEmulators: Bool {
        ProcessInfo.processInfo.arguments.contains("-useEmulators")
            || ProcessInfo.processInfo.environment["USE_FIREBASE_EMULATORS"] == "1"
    }

    init() {
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.user = user
            self?.ready = true

            // `-useEmulators -devSignIn` walks straight in, so screens can be
            // driven and looked at without a Google account. Gated on the
            // emulators twice over: there is no path into it on a device.
            if user == nil, Self.useEmulators,
               ProcessInfo.processInfo.arguments.contains("-devSignIn") {
                Task { @MainActor in await self?.devSignIn(email: "cristian@example.com") }
            }
        }
    }

    deinit {
        if let handle { Auth.auth().removeStateDidChangeListener(handle) }
    }

    @MainActor
    func signIn() async {
        error = nil
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            error = "Falta el CLIENT_ID en GoogleService-Info.plist"
            return
        }
        guard let root = UIApplication.shared.rootViewController else {
            error = "No encontré la ventana para abrir el login"
            return
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
            guard let idToken = result.user.idToken?.tokenString else {
                error = "Google no devolvió el token"
                return
            }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString
            )
            _ = try await Auth.auth().signIn(with: credential)
        } catch {
            // A cancelled sign-in is not a failure worth shouting about.
            if (error as NSError).code != GIDSignInError.canceled.rawValue {
                self.error = error.localizedDescription
            }
        }
    }

    /// Emulator-only shortcut so screens can be driven without a Google account.
    /// It refuses to exist off the emulators, so there is no path into it from a
    /// real build.
    @MainActor
    func devSignIn(email: String) async {
        guard Self.useEmulators else { return }
        do {
            _ = try await Auth.auth().signIn(withEmail: email, password: "emulator-only")
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        try? Auth.auth().signOut()
    }
}

extension UIApplication {
    var rootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}
