import Foundation
import Observation
import WatchConnectivity

/// One row of the list, as the phone flattened it.
struct WatchEntry: Identifiable, Equatable {
    let id: String
    let label: String
    let detail: String?
    var checked: Bool
}

/// Watch side of the relay.
///
/// It receives the list through `updateApplicationContext` (the phone always
/// sends the whole snapshot, so there is no merge to get wrong) and sends ticks
/// back by whichever route fits: `sendMessage` when the phone is in range, so
/// the other person sees the tick immediately, and `transferUserInfo` when it
/// is not — that one queues on disk and delivers even if the phone is asleep,
/// which is what makes this work in a supermarket basement.
@Observable
final class WatchLink: NSObject {
    private(set) var entries: [WatchEntry] = []
    private(set) var today: String?
    private(set) var todayNote: String?
    /// True until the phone has sent anything at all — "empty list" and "we have
    /// never spoken" look identical otherwise, and only one of them is good news.
    private(set) var everReceived = false

    private var session: WCSession { WCSession.default }

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        session.delegate = self
        session.activate()
    }

    var pending: [WatchEntry] { entries.filter { !$0.checked } }
    var done: [WatchEntry] { entries.filter(\.checked) }

    /// Ticks locally first: the wrist has to feel instant, and the round trip
    /// through the phone is not. The next snapshot overwrites this either way.
    func toggle(_ entry: WatchEntry) {
        let next = !entry.checked
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[index].checked = next
        }
        guard WCSession.isSupported() else { return }
        let payload: [String: Any] = ["entryId": entry.id, "wantChecked": next]

        // Two people share this list, so a tick has to reach the other phone
        // now, not eventually: sendMessage is immediate but needs the phone in
        // range, while transferUserInfo always arrives but the system may sit on
        // it for minutes to save battery. Try the fast path, fall back on
        // failure — which covers the phone going out of range mid-send, not just
        // being out of range to begin with.
        if session.isReachable {
            session.sendMessage(
                payload,
                replyHandler: nil,
                errorHandler: { [weak self] _ in
                    self?.session.transferUserInfo(payload)
                })
        } else {
            session.transferUserInfo(payload)
        }
    }

    private func apply(_ context: [String: Any]) {
        guard let raw = context["entries"] as? [[String: Any]] else { return }
        let received: [WatchEntry] = raw.compactMap { row in
            guard let id = row["id"] as? String, let label = row["label"] as? String
            else { return nil }
            return WatchEntry(
                id: id,
                label: label,
                detail: row["detail"] as? String,
                // The phone's value wins the moment it arrives: it has seen the
                // tick, and it may also have seen the other person's.
                checked: row["checked"] as? Bool ?? false
            )
        }
        let today = context["today"] as? String
        let note = context["todayNote"] as? String

        Task { @MainActor in
            self.entries = received
            self.today = today
            self.todayNote = note
            self.everReceived = true
        }
    }
}

extension WatchLink: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        // Whatever arrived while the app was closed is waiting right here.
        apply(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        apply(context)
    }
}
