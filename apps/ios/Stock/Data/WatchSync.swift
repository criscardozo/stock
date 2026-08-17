import Foundation
#if canImport(WatchConnectivity)
    import WatchConnectivity
#endif

/// Phone side of the Watch relay.
///
/// The watch cannot sign in — Google needs a browser and there isn't one on a
/// wrist — so it never touches Firestore. It receives a flattened snapshot of
/// the shopping list here and sends ticks back; this service, running inside
/// the already-authenticated phone app, performs the write.
///
/// Everything crossing the boundary is already formatted for display. The watch
/// gets "500 g", never `(500, .g)`, so the domain has exactly one implementation
/// and the watch target needs none of it. Same shape as Gastos Diarios — see
/// docs/reglas.md §10.
final class WatchSync: NSObject {
    static let shared = WatchSync()

    /// Keys shared verbatim with the watch target.
    enum Key {
        // phone → watch
        static let entries = "entries"
        static let today = "today"
        static let todayNote = "todayNote"
        static let updatedAt = "updatedAt"
        // one entry, flattened
        static let id = "id"
        static let label = "label"
        static let detail = "detail"
        static let checked = "checked"
        // watch → phone
        static let entryId = "entryId"
        static let wantChecked = "wantChecked"
    }

    /// Set by the Store so a tick arriving while the app is in the background
    /// still knows which household it belongs to.
    var householdId: String?
    var uid: String?

    #if canImport(WatchConnectivity)
        private var session: WCSession? {
            WCSession.isSupported() ? WCSession.default : nil
        }
        /// The last snapshot, held until the session finishes activating.
        private var pending: [String: Any]?
    #endif

    /// Idempotent; called every time the Store starts.
    func start() {
        #if canImport(WatchConnectivity)
            guard let session else { return }
            session.delegate = self
            if session.activationState != .activated { session.activate() }
        #endif
    }

    /// Replaces the watch's copy of the list. `updateApplicationContext` keeps
    /// only the most recent value, which is exactly right for a snapshot: an
    /// old list is never worth delivering.
    func push(entries: [[String: Any]], today: String?, todayNote: String?) {
        #if canImport(WatchConnectivity)
            var context: [String: Any] = [
                Key.entries: entries,
                // Without something that always changes, WatchConnectivity drops
                // a context identical to the last one — and "the tick you just
                // made was undone" produces exactly that payload.
                Key.updatedAt: Date().timeIntervalSince1970,
            ]
            if let today { context[Key.today] = today }
            if let todayNote { context[Key.todayNote] = todayNote }

            guard let session, session.activationState == .activated else {
                pending = context
                return
            }
            try? session.updateApplicationContext(context)
        #endif
    }

    #if canImport(WatchConnectivity)
        /// A tick from the wrist. Writing `checked` to the value the watch asked
        /// for (rather than flipping what is there) makes a redelivered transfer
        /// harmless.
        private func handle(_ payload: [String: Any]) {
            guard let entryId = payload[Key.entryId] as? String,
                let checked = payload[Key.wantChecked] as? Bool,
                let householdId, let uid
            else { return }
            Mutations.setChecked(
                householdId: householdId, uid: uid, entryId: entryId, checked: checked)
        }
    #endif
}

#if canImport(WatchConnectivity)
    extension WatchSync: WCSessionDelegate {
        func session(
            _ session: WCSession,
            activationDidCompleteWith activationState: WCSessionActivationState,
            error: Error?
        ) {
            guard activationState == .activated, let context = pending else { return }
            pending = nil
            try? session.updateApplicationContext(context)
        }

        func sessionDidBecomeInactive(_ session: WCSession) {}

        /// Re-activate, so a re-paired or swapped watch keeps working.
        func sessionDidDeactivate(_ session: WCSession) { session.activate() }

        /// The immediate path, taken whenever the phone is in range.
        func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
            handle(message)
        }

        /// The queued path. Delivered even if the phone app was asleep when the
        /// watch sent it — what makes a tick survive a supermarket with no signal.
        func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
            handle(userInfo)
        }
    }
#endif
