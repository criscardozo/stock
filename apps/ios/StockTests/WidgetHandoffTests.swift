import XCTest

/// The app → widget handoff.
///
/// `WidgetBridge.Snapshot` and `MealSnapshot` are the same shape declared
/// twice, because the widget extension shares no code with the app. Nothing
/// makes them agree: rename a field on one side and the app keeps writing, the
/// widget keeps decoding nil, and the home screen quietly says "Abrí Stock"
/// forever. So the test is the round trip itself.
final class WidgetHandoffTests: XCTestCase {
    private let snapshot = WidgetBridge.Snapshot(
        title: "Pastel de papa",
        isRecipe: true,
        missing: 2,
        cooked: false,
        date: "2026-09-05",
        timezone: "Australia/Sydney",
        updatedAtEpoch: 1_770_000_000
    )

    func testTheWidgetDecodesWhatTheAppWrites() throws {
        let data = try JSONEncoder().encode(snapshot)
        let mirror = try JSONDecoder().decode(MealSnapshot.self, from: data)

        XCTAssertEqual(mirror.title, snapshot.title)
        XCTAssertEqual(mirror.isRecipe, snapshot.isRecipe)
        XCTAssertEqual(mirror.missing, snapshot.missing)
        XCTAssertEqual(mirror.cooked, snapshot.cooked)
        XCTAssertEqual(mirror.date, snapshot.date)
        XCTAssertEqual(mirror.timezone, snapshot.timezone)
        XCTAssertEqual(mirror.updatedAtEpoch, snapshot.updatedAtEpoch)
    }

    func testTheMirrorHasNoFieldTheAppNeverWrites() throws {
        // The other direction of the same drift: a field added to the widget
        // and not to the app decodes as missing, and for a non-optional that
        // throws — which is better than a default nobody chose, and is what
        // this asserts stays true.
        let data = try JSONEncoder().encode(snapshot)
        XCTAssertNoThrow(try JSONDecoder().decode(MealSnapshot.self, from: data))
    }

    func testNothingPlannedSurvivesTheTrip() throws {
        // "Sin plan" is a real answer, not an error, so `title` is optional and
        // the nil has to arrive as nil rather than as an empty string.
        var empty = snapshot
        empty.title = nil
        empty.isRecipe = false
        empty.missing = nil
        let mirror = try JSONDecoder().decode(
            MealSnapshot.self, from: JSONEncoder().encode(empty)
        )
        XCTAssertNil(mirror.title)
        XCTAssertNil(mirror.missing)
    }

    // MARK: - Staleness

    private func at(_ iso: String, _ zone: String) -> Date {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.timeZone = TimeZone(identifier: zone)
        return formatter.date(from: iso)!
    }

    func testCurrentIsJudgedInTheHouseholdZoneAndNotTheDevices() throws {
        let mirror = try JSONDecoder().decode(
            MealSnapshot.self, from: JSONEncoder().encode(snapshot)
        )
        // Both ends of the household's own day.
        XCTAssertTrue(mirror.isCurrent(now: at("2026-09-05 23:30", "Australia/Sydney")))
        XCTAssertTrue(mirror.isCurrent(now: at("2026-09-05 00:10", "Australia/Sydney")))
    }

    func testTheZoneThatDecidesIsTheSnapshotsAndNotTheMachines() throws {
        // The assertion above cannot fail on this machine: it runs in
        // Australia/Sydney, so reading the DEVICE's zone instead of the
        // household's gives the same answer every time. Measured — swapping
        // `TimeZone(identifier: timezone)` for `.current` broke nothing.
        //
        // So this one describes a household somewhere else. The instant is
        // 09:00 on the 5th in Sydney, which is still the 4th in Honolulu: the
        // snapshot is current for that household and stale for this machine.
        var elsewhere = snapshot
        elsewhere.timezone = "Pacific/Honolulu"
        elsewhere.date = "2026-09-04"
        let mirror = try JSONDecoder().decode(
            MealSnapshot.self, from: JSONEncoder().encode(elsewhere)
        )
        XCTAssertTrue(mirror.isCurrent(now: at("2026-09-05 09:00", "Australia/Sydney")))
        XCTAssertFalse(mirror.isCurrent(now: at("2026-09-06 09:00", "Australia/Sydney")))
    }

    func testYesterdaysDinnerIsNotCurrent() throws {
        let mirror = try JSONDecoder().decode(
            MealSnapshot.self, from: JSONEncoder().encode(snapshot)
        )
        // The failure the date exists to catch: the app has not run since
        // last night, and the widget would otherwise announce that meal today
        // with no sign anything is wrong.
        XCTAssertFalse(mirror.isCurrent(now: at("2026-09-06 09:00", "Australia/Sydney")))
        XCTAssertFalse(mirror.isCurrent(now: at("2026-09-04 21:00", "Australia/Sydney")))
    }
}
