import XCTest

/// The vectors are the contract between the Swift domain and its TypeScript
/// twin. A case added here MUST be added there — that is the whole point of the
/// file living in `shared/`.
final class CalendarDateTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Today: Decodable {
            let name: String
            let instant: String
            let timezone: String
            let expected: String
        }
        struct Weekday: Decodable {
            let date: String
            let expected: Int
        }
        struct Add: Decodable {
            let name: String?
            let date: String
            let days: Int
            let expected: String
        }
        struct Start: Decodable {
            let name: String
            let date: String
            let startWeekday: Int
            let expected: String
        }
        struct End: Decodable {
            let name: String?
            let startDate: String
            let length: String
            let expected: String
        }
        struct Days: Decodable {
            let name: String?
            let startDate: String
            let length: String
            let expected: [String]
        }

        let todayIn: [Today]
        let weekdayOf: [Weekday]
        let addDays: [Add]
        let periodStartFor: [Start]
        let periodEndFor: [End]
        let daysOf: [Days]
    }

    /// The vector file is data, and `Decodable` DISCARDS keys it does not know:
    /// a group added to the JSON and never wired up here is silently skipped and
    /// the suite stays green, reporting the same number of tests as before. Same
    /// failure shape this file is full of tests for — a pass that means "I ran
    /// less than you think".
    ///
    /// The SET is asserted rather than a count, so both halves are caught: a
    /// group added and never read, and one renamed or removed while `Vectors`
    /// still declares it. The TypeScript suite asserts the same set; if the two
    /// ever disagree, one platform is running fewer vectors than the other.
    func testTheVectorFileHasExactlyTheGroupsThisSuiteReads() throws {
        let url = try XCTUnwrap(
            Bundle(for: CalendarDateTests.self).url(
                forResource: "plan-period-vectors", withExtension: "json"),
            "falta plan-period-vectors.json en el bundle de tests"
        )
        let raw = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        // `$`-prefixed keys are the file's own convention for prose ($comment,
        // $rules), so they are metadata and not a group anyone should run.
        let groups = Set((raw as? [String: Any] ?? [:]).keys.filter { !$0.hasPrefix("$") })
        XCTAssertEqual(
            groups,
            ["todayIn", "weekdayOf", "addDays", "periodStartFor", "periodEndFor", "daysOf"],
            "grupo nuevo o renombrado en el JSON: agregalo a Vectors y a su propio test"
        )
    }

    private static func load() throws -> Vectors {
        let url = try XCTUnwrap(
            Bundle(for: CalendarDateTests.self).url(
                forResource: "plan-period-vectors", withExtension: "json"),
            "plan-period-vectors.json is not in the test bundle — check project.yml resources"
        )
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    func testTodayIn() throws {
        for testCase in try Self.load().todayIn {
            let instant = try XCTUnwrap(Self.iso.date(from: testCase.instant))
            XCTAssertEqual(
                CalendarDate.today(in: testCase.timezone, now: instant),
                testCase.expected,
                testCase.name
            )
        }
    }

    func testWeekdayOf() throws {
        for testCase in try Self.load().weekdayOf {
            XCTAssertEqual(CalendarDate.weekday(of: testCase.date), testCase.expected, testCase.date)
        }
    }

    func testAddDays() throws {
        for testCase in try Self.load().addDays {
            XCTAssertEqual(
                CalendarDate.adding(testCase.days, to: testCase.date),
                testCase.expected,
                testCase.name ?? "\(testCase.date) + \(testCase.days)"
            )
        }
    }

    func testPeriodStartFor() throws {
        for testCase in try Self.load().periodStartFor {
            XCTAssertEqual(
                CalendarDate.periodStart(for: testCase.date, startWeekday: testCase.startWeekday),
                testCase.expected,
                testCase.name
            )
        }
    }

    func testPeriodEndFor() throws {
        for testCase in try Self.load().periodEndFor {
            let length = try XCTUnwrap(PlanLength(rawValue: testCase.length))
            XCTAssertEqual(
                CalendarDate.periodEnd(startDate: testCase.startDate, length: length),
                testCase.expected,
                testCase.name ?? testCase.startDate
            )
        }
    }

    func testDaysOf() throws {
        for testCase in try Self.load().daysOf {
            let length = try XCTUnwrap(PlanLength(rawValue: testCase.length))
            XCTAssertEqual(
                CalendarDate.days(startDate: testCase.startDate, length: length),
                testCase.expected,
                testCase.name ?? testCase.startDate
            )
        }
    }

    func testPeriodsChain() {
        // The next period starts the day after this one ends — the property the
        // whole materialisation scheme rests on.
        let start = CalendarDate.periodStart(for: "2026-04-01", startWeekday: 6)
        let end = CalendarDate.periodEnd(startDate: start, length: .weekly)
        let next = CalendarDate.adding(1, to: end)
        XCTAssertEqual(CalendarDate.periodStart(for: next, startWeekday: 6), next)
    }

    func testIsoValidation() {
        XCTAssertTrue(CalendarDate.isIso("2026-08-17"))
        XCTAssertFalse(CalendarDate.isIso("17/08/2026"))
        XCTAssertFalse(CalendarDate.isIso("2026-8-17"))
        XCTAssertFalse(CalendarDate.isIso("ayer"))
    }
}
