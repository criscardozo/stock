import Foundation

/// Mirror of the app's `WidgetBridge.Snapshot` — kept in sync by hand, because
/// the widget shares no code with the app target. Written by the app to the
/// shared app-group defaults whenever the plan or the stock changes.
struct MealSnapshot: Codable {
    var title: String?
    var isRecipe: Bool
    var missing: Int?
    var cooked: Bool
    /// The day this describes, "YYYY-MM-DD" in the household timezone.
    var date: String
    var timezone: String
    var updatedAtEpoch: Int

    static let appGroupId = "group.dev.cardozo.stock"
    static let key = "mealSnapshot"

    static func load() -> MealSnapshot? {
        guard let data = UserDefaults(suiteName: appGroupId)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(MealSnapshot.self, from: data)
    }

    /// Whether this still describes today, in the household's timezone.
    ///
    /// The check that matters. A widget goes on rendering long after the app
    /// last ran, and a stale one does not look stale — it looks like a
    /// confident answer about tonight that happens to be yesterday's.
    func isCurrent(now: Date = Date()) -> Bool {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: timezone) ?? .current
        return formatter.string(from: now) == date
    }

    /// What the gallery preview shows, and the redacted placeholder.
    static var sample: MealSnapshot {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return MealSnapshot(
            title: "Milanesas",
            isRecipe: true,
            missing: 0,
            cooked: false,
            date: formatter.string(from: Date()),
            timezone: TimeZone.current.identifier,
            updatedAtEpoch: Int(Date().timeIntervalSince1970)
        )
    }
}
