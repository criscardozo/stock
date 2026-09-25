import Foundation

/// Calendar arithmetic, the Swift half of the contract.
///
/// The TypeScript twin lives in `apps/web/src/lib/domain/dates.ts`, and both are
/// validated by `shared/plan-period-vectors.json` — change the vectors first.
///
/// Two rules make everything else fall out:
///  1. A date is a `"YYYY-MM-DD"` string in the HOUSEHOLD's timezone, so 23:30
///     in Sydney is still today, and a member travelling doesn't shift the plan.
///  2. Arithmetic happens in UTC, which has no DST, so adding a day across the
///     end of daylight saving is exactly one day. `+ 86_400` seconds is not.
enum CalendarDate {
    /// A calendar day, `"YYYY-MM-DD"`.
    typealias Iso = String

    private static let utc = TimeZone(identifier: "UTC")!

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }()

    static func isIso(_ value: String) -> Bool {
        // Spelled out rather than a regex literal: this runs on every document
        // that comes off a snapshot, and the shape is fixed and tiny.
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2
        else { return false }
        return parts.allSatisfy { $0.allSatisfy(\.isNumber) }
    }

    private static func components(_ date: Iso) -> DateComponents? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return DateComponents(year: parts[0], month: parts[1], day: parts[2])
    }

    private static func format(_ date: Date) -> Iso {
        let parts = utcCalendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The calendar date it is right now in `timezone`.
    static func today(in timezone: String, now: Date = Date()) -> Iso {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timezone) ?? utc
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// 0 = Sunday, matching JS `getDay()` and `planConfig.startWeekday`.
    static func weekday(of date: Iso) -> Int {
        guard let parts = components(date), let day = utcCalendar.date(from: parts) else { return 0 }
        // Foundation counts Sunday as 1; the contract counts it as 0.
        return utcCalendar.component(.weekday, from: day) - 1
    }

    static func adding(_ days: Int, to date: Iso) -> Iso {
        guard let parts = components(date), let start = utcCalendar.date(from: parts),
              let moved = utcCalendar.date(byAdding: .day, value: days, to: start)
        else { return date }
        return format(moved)
    }

    static func daysBetween(_ from: Iso, _ to: Iso) -> Int {
        guard let a = components(from), let b = components(to),
              let start = utcCalendar.date(from: a), let end = utcCalendar.date(from: b)
        else { return 0 }
        return utcCalendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    /// The start of the period `date` falls in, given the configured start weekday.
    static func periodStart(for date: Iso, startWeekday: Int) -> Iso {
        let back = (weekday(of: date) - startWeekday + 7) % 7
        return adding(-back, to: date)
    }

    /// Inclusive end: a weekly period starting Saturday ends the following Friday.
    static func periodEnd(startDate: Iso, length: PlanLength) -> Iso {
        adding(length.days - 1, to: startDate)
    }

    static func days(startDate: Iso, length: PlanLength) -> [Iso] {
        (0..<length.days).map { adding($0, to: startDate) }
    }
}

enum PlanLength: String, Codable, CaseIterable {
    case weekly
    case fortnightly

    var days: Int { self == .weekly ? 7 : 14 }
    var label: String { self == .weekly ? "Semanal" : "Quincenal" }
}
