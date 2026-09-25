import Foundation
import Observation
import WatchConnectivity

/// One row of the list, as the phone flattened it. `Sendable` because it is
/// built where WatchConnectivity delivers and handed to the main actor.
struct WatchEntry: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let detail: String?
    var checked: Bool
}

/// Everything a snapshot carries, already parsed — so the part that crosses
/// from WatchConnectivity's queue to the main actor is Sendable, and the
/// `[String: Any]` it came in never has to.
private struct WatchSnapshot: Sendable {
    let entries: [WatchEntry]
    let today: String?
    let todayNote: String?
}

/// Watch side of the relay.
///
/// It receives the list through `updateApplicationContext` (the phone always
/// sends the whole snapshot, so there is no merge to get wrong) and sends ticks
/// back by whichever route fits: `sendMessage` when the phone is in range, so
/// the other person sees the tick immediately, and `transferUserInfo` when it
/// is not — that one queues on disk and delivers even if the phone is asleep,
/// which is what makes this work in a supermarket basement.
///
/// Main-actor isolated: it is the state the watch's views draw from. The
/// WatchConnectivity delegate callbacks arrive on a background queue, so they
/// are `nonisolated` and hand over a parsed snapshot instead of touching it.
@MainActor
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
            // The error handler runs on WatchConnectivity's queue, off the main
            // actor, so it neither reaches into `self` nor captures `payload`:
            // it rebuilds the fallback from two Sendable values.
            let id = entry.id
            session.sendMessage(
                payload,
                replyHandler: nil,
                errorHandler: { _ in
                    WCSession.default.transferUserInfo(["entryId": id, "wantChecked": next])
                })
        } else {
            session.transferUserInfo(payload)
        }
    }

    /// Parses where the context arrives, before anything crosses to the main
    /// actor. `nil` means the context carried no list at all — which must not
    /// count as "received", or an empty payload would read as an empty list.
    nonisolated private static func parse(_ context: [String: Any]) -> WatchSnapshot? {
        guard let raw = context["entries"] as? [[String: Any]] else { return nil }
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
        return WatchSnapshot(
            entries: received,
            today: context["today"] as? String,
            todayNote: context["todayNote"] as? String
        )
    }

    private func assign(_ snapshot: WatchSnapshot) {
        entries = snapshot.entries
        today = snapshot.today
        todayNote = snapshot.todayNote
        everReceived = true
    }

    /// The one entry point from WatchConnectivity: parse off the main actor,
    /// then hand over.
    nonisolated private func deliver(_ context: [String: Any]) {
        guard let snapshot = Self.parse(context) else { return }
        Task { @MainActor in self.assign(snapshot) }
    }
}

extension WatchLink: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        // Whatever arrived while the app was closed is waiting right here.
        deliver(session.receivedApplicationContext)
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        deliver(context)
    }
}
