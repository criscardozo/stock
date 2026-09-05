import XCTest

/// The derivations every list renders from, on this side.
///
/// The mirror of the web's `domain/items.test.ts`, deliberately case for case.
/// Both platforms implement `stock` and `expiry` separately from the same
/// prose, and until now this side had them covered only sideways, through the
/// shared shopping vectors — which never look at expiry at all, so a change to
/// `expiry` could pass the whole Swift suite. The web had the identical gap
/// this morning; it was closed there first.
///
/// Built through `Item(id:data:)` rather than a memberwise initialiser so the
/// cases stay readable as the documents they describe.
final class ItemStateTests: XCTestCase {
    private let today: CalendarDate.Iso = "2026-09-04"

    private func item(_ overrides: [String: Any] = [:]) -> Item {
        var data: [String: Any] = [
            "name": "X", "categoryId": "c", "locationId": "l",
            "tracking": "quantity", "quantity": 5, "minQuantity": 2,
        ]
        for (k, v) in overrides { data[k] = v }
        return Item(id: "x", data: data)!
    }

    private func levelled(_ overrides: [String: Any]) -> Item {
        var data: [String: Any] = ["tracking": "level"]
        for (k, v) in overrides { data[k] = v }
        var base = data
        base["quantity"] = nil
        base["minQuantity"] = nil
        return item(base)
    }

    // MARK: - stock, counted

    func testZeroIsOutWhateverTheMinimumSays() {
        // A minimum of 0 means "no floor", not "never tell me" — running out is
        // the strongest signal there is, and silencing it is autoSuggest's job.
        XCTAssertEqual(ItemState.stock(item(["quantity": 0, "minQuantity": 0])), .out)
        XCTAssertEqual(ItemState.stock(item(["quantity": 0, "minQuantity": 6])), .out)
    }

    func testAtTheMinimumIsAlreadyLow() {
        // The boundary is `<=`. At the minimum you are AT the line you set,
        // which is the moment to buy, not the moment after.
        XCTAssertEqual(ItemState.stock(item(["quantity": 2, "minQuantity": 2])), .low)
        XCTAssertEqual(ItemState.stock(item(["quantity": 3, "minQuantity": 2])), .ok)
    }

    // MARK: - stock, level

    func testAnEmptyLevelIsOutAndTheMinimumDefaultsToPoco() {
        XCTAssertEqual(ItemState.stock(levelled(["level": 0])), .out)
        XCTAssertEqual(ItemState.stock(levelled(["level": 1])), .low)
        XCTAssertEqual(ItemState.stock(levelled(["level": 2])), .ok)
    }

    func testWithAReserveWhatIsAtHandIncludesTheSealedOnes() {
        // An empty open bottle with a FULL reserve behind it is nothing to act
        // on: you open one, the reserve drops below its minimum, and the
        // purchase appears THEN. That is the whole point of counting the sealed
        // ones instead of waiting for the last bottle to run dry.
        XCTAssertEqual(ItemState.stock(levelled(["level": 0, "spare": 2, "minSpare": 2])), .ok)
        XCTAssertEqual(ItemState.stock(levelled(["level": 0, "spare": 0, "minSpare": 2])), .out)
        XCTAssertEqual(ItemState.stock(levelled(["level": 3, "spare": 1, "minSpare": 2])), .low)
        XCTAssertEqual(ItemState.stock(levelled(["level": 3, "spare": 2, "minSpare": 2])), .ok)
    }

    // MARK: - expiry

    func testYesterdayIsExpiredAndTodayIsNot() {
        XCTAssertEqual(ItemState.expiry(item(["expiresAt": "2026-09-03"]), today: today), .expired)
        // Today's yoghurt is still edible today. Calling it expired would hide
        // it behind the same chip as last week's.
        XCTAssertEqual(ItemState.expiry(item(["expiresAt": today]), today: today), .expiring)
    }

    func testTheWindowIsInclusiveAtItsFarEdge() {
        XCTAssertEqual(ItemState.expiringWithinDays, 3)
        XCTAssertEqual(ItemState.expiry(item(["expiresAt": "2026-09-07"]), today: today), .expiring)
        XCTAssertEqual(ItemState.expiry(item(["expiresAt": "2026-09-08"]), today: today), .fresh)
    }

    func testNoDateIsNotAStateToWarnAbout() {
        XCTAssertEqual(ItemState.expiry(item(), today: today), ExpiryStatus.none)
    }

    // MARK: - snooze

    func testASnoozeCoversTheDayItNamesAndStopsTheDayAfter() {
        XCTAssertTrue(ItemState.isSnoozed(item(["snoozedUntil": today]), today: today))
        XCTAssertFalse(ItemState.isSnoozed(item(["snoozedUntil": "2026-09-03"]), today: today))
        XCTAssertFalse(ItemState.isSnoozed(item(), today: today))
    }
}
