import Foundation
import OSLog
import UserNotifications

/// Expiry reminders, scheduled LOCALLY.
///
/// There is no server push here and there won't be: scheduled push needs Cloud
/// Functions, which need the paid plan. The app reschedules every time it runs,
/// which is honest about its limit — if nobody opens the app for weeks, nobody
/// gets told. Settings says so out loud.
enum ExpiryNotifications {
    private static let enabledKey = "expiry.alerts.enabled"
    private static let daysKey = "expiry.alerts.days"
    private static let prefix = "expiry."
    private static let log = Logger(subsystem: "dev.cardozo.stock", category: "notifications")

    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static var daysAhead: Int {
        get {
            let stored = UserDefaults.standard.integer(forKey: daysKey)
            return stored == 0 ? 3 : stored
        }
        set { UserDefaults.standard.set(newValue, forKey: daysKey) }
    }

    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// Wipes and rebuilds the schedule. Rebuilding beats diffing: the set is
    /// small, and a stale reminder about yoghurt you already ate is worse than
    /// the work of redoing it.
    static func reschedule(items: [Item], today: CalendarDate.Iso) async {
        let center = UNUserNotificationCenter.current()
        let existing = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: existing)

        guard isEnabled, await requestPermission() else { return }

        // Capped and ordered by ExpiryReminders, because iOS keeps 64 pending
        // notifications and DISCARDS the rest without a word. Left to chance,
        // the ones lost would be whichever the listener delivered last.
        let wanted = ExpiryReminders.scheduled(items: items, today: today, daysAhead: daysAhead)
        if wanted.count < items.filter({ $0.expiresAt != nil }).count {
            log.debug("scheduling \(wanted.count) of \(items.count) items")
        }

        for item in wanted {
            guard let expiresAt = item.expiresAt else { continue }
            let warnOn = CalendarDate.adding(-daysAhead, to: expiresAt)
            guard let fireDate = date(warnOn) else { continue }

            let content = UNMutableNotificationContent()
            content.title = item.name
            content.body = daysAhead == 1
                ? "Vence mañana."
                : "Vence en \(daysAhead) días."
            content.sound = .default

            let components = Calendar.current.dateComponents(
                [.year, .month, .day, .hour], from: fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

            do {
                try await center.add(
                    UNNotificationRequest(
                        identifier: "\(prefix)\(item.id)", content: content, trigger: trigger))
            } catch {
                // A reminder that could not be scheduled is information, not
                // noise: it is the difference between "no alerts because
                // nothing expires" and "no alerts because they all failed".
                log.error("could not schedule \(item.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// 9am local on the warning day — early enough to act, late enough not to wake anyone.
    private static func date(_ iso: CalendarDate.Iso) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(
            from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 9))
    }
}
