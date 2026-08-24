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
        earliest(of: embeddedProfileURLs().compactMap { url in
            (try? Data(contentsOf: url)).flatMap(expiry(fromProfile:))
        })
    }

    /// EVERY profile in the bundle, not just the app's.
    ///
    /// The watch app is signed separately and its profile can carry a different
    /// date: Xcode reissues only what is missing, so one added later gets its
    /// own 7 days. Reading just `Bundle.main`'s would report a week left while
    /// the watch app quietly stops launching days earlier — a screen stating a
    /// date that is not the one that matters, which is worse than saying
    /// nothing. `earliest` is the honest answer to "when does this stop
    /// working".
    ///
    /// Extensions are globbed rather than named so a widget added later is
    /// covered without anyone remembering to come back here.
    private static func embeddedProfileURLs() -> [URL] {
        let root = Bundle.main.bundleURL
        var urls: [URL] = []
        if let own = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") {
            urls.append(own)
        }
        for (directory, ext) in [("Watch", "app"), ("PlugIns", "appex")] {
            let contents = try? FileManager.default.contentsOfDirectory(
                at: root.appendingPathComponent(directory),
                includingPropertiesForKeys: nil
            )
            for nested in contents ?? [] where nested.pathExtension == ext {
                let profile = nested.appendingPathComponent("embedded.mobileprovision")
                if FileManager.default.fileExists(atPath: profile.path) { urls.append(profile) }
            }
        }
        return urls
    }

    /// The soonest of several expiries — the testable core. Nil when empty, so
    /// the Simulator and App Store builds still report nothing.
    static func earliest(of dates: [Date]) -> Date? {
        dates.min()
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
