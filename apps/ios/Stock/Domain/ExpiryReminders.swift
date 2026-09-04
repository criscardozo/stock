import Foundation

/// Which items get an expiry reminder, and in what order.
///
/// Pure, and in Domain/ rather than beside the scheduling code, for one
/// reason: **iOS keeps at most 64 pending local notifications per app and drops
/// the rest in silence.** With a catalogue of ~150 items the overflow is real,
/// and which reminders survive cannot be left to the order a Firestore listener
/// happened to deliver — the ones that matter are the ones expiring soonest.
///
/// Being a pure function of `[Item]` is what lets StockTests compile it:
/// `ExpiryNotifications` imports UserNotifications and never enters the test
/// target, so before this existed the selection could not be checked at all.
enum ExpiryReminders {
    /// Under the 64 iOS allows, with room for anything else the app might ever
    /// schedule. Going over does not error — it silently discards — so the
    /// margin is the whole point.
    static let maxScheduled = 60

    /// The items to warn about, soonest first, capped.
    ///
    /// - An item with no expiry, or one already past, is not a reminder: the
    ///   stock screen already says "Vencido" and a notification about it would
    ///   arrive too late to be an action.
    /// - The warning day is `expiresAt - daysAhead`. A day that has already
    ///   passed is skipped rather than fired immediately, because a reminder
    ///   that arrives the moment you open the app is noise, not a warning.
    /// - Ties break on `id` so the set is stable across runs: rescheduling
    ///   wipes and rebuilds, and an unstable order would silently swap which
    ///   items make the cut.
    static func scheduled(
        items: [Item],
        today: CalendarDate.Iso,
        daysAhead: Int,
        limit: Int = maxScheduled
    ) -> [Item] {
        items
            .filter { item in
                guard let expiresAt = item.expiresAt, expiresAt >= today else { return false }
                return CalendarDate.adding(-daysAhead, to: expiresAt) >= today
            }
            .sorted { a, b in
                let left = a.expiresAt ?? "", right = b.expiresAt ?? ""
                return left == right ? a.id < b.id : left < right
            }
            .prefix(limit)
            .map { $0 }
    }
}
