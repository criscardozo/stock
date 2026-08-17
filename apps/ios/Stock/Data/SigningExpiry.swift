import Foundation

/// When this build's code signature stops working.
///
/// Distribution is a free-account sideload, so the provisioning profile lives
/// for 7 days and the app simply stops launching afterwards. The date is read
/// from the profile embedded in the bundle rather than from a stored
/// "installed on" date: re-signing does NOT wipe the app container, so a stored
/// date would report the very first install forever, while the embedded profile
/// is replaced on every signing.
///
/// Absent in the Simulator and in App Store builds (no profile), where
/// everything here reports nil and the UI hides itself.
///
/// Lifted from Gastos Diarios, which has the same distribution problem — and
/// this app needs it more, since nothing else on screen would ever mention that
/// the build has a week to live.
enum SigningExpiry {
    /// Computed once: the bundle cannot change while the app is running.
    static let date: Date? = readEmbeddedProfileExpiry()

    /// Whole days left (0 = expires today, negative = already expired).
    static func daysRemaining(now: Date = Date()) -> Int? {
        guard let date else { return nil }
        return daysRemaining(expiry: date, now: now)
    }

    /// Whole calendar days between two instants — the testable core.
    static func daysRemaining(expiry: Date, now: Date) -> Int {
        let calendar = Calendar.current
        return calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: now),
            to: calendar.startOfDay(for: expiry)
        ).day ?? 0
    }

    static func isExpiringSoon(now: Date = Date()) -> Bool {
        guard let days = daysRemaining(now: now) else { return false }
        return days <= 2
    }

    private static func readEmbeddedProfileExpiry() -> Date? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return expiry(fromProfile: data)
    }

    /// `embedded.mobileprovision` is a CMS (PKCS#7) container wrapping a plist.
    /// The signature is Apple's and we are not validating it — only the payload
    /// is needed — so the plist is sliced out by its XML delimiters rather than
    /// pulling in a crypto dependency. Internal so tests can run it without a
    /// signed bundle.
    static func expiry(fromProfile data: Data) -> Date? {
        guard let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(
                of: Data("</plist>".utf8), options: [], in: start.lowerBound..<data.endIndex)
        else { return nil }

        let plistData = data[start.lowerBound..<end.upperBound]
        let plist = try? PropertyListSerialization.propertyList(
            from: plistData, options: [], format: nil)
        return (plist as? [String: Any])?["ExpirationDate"] as? Date
    }
}
