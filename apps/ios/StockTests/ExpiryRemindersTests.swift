import XCTest

/// iOS keeps 64 pending local notifications and drops the rest in SILENCE, so
/// what these tests protect is not a number — it is that the reminders which
/// survive are the ones worth having.
final class ExpiryRemindersTests: XCTestCase {
    private func item(_ id: String, expires: String?) -> Item {
        Item(
            id: id, name: id, nameEs: nil, brand: nil, categoryId: "c", locationId: "l",
            tracking: .quantity, unit: .unit, quantity: 1, minQuantity: 0,
            level: nil, minLevel: nil, spare: nil, minSpare: nil, autoSuggest: nil,
            packSize: nil, barcodes: [], expiresAt: expires, snoozedUntil: nil,
            lastPriceCents: nil, notes: nil)
    }

    private let today = "2026-09-04"

    func testCapsAtSixtyAndKeepsTheSoonest() {
        // 80 items expiring on consecutive days: everything is in range, so the
        // cap is the only thing deciding, which is the case that used to lose
        // reminders without saying so.
        let items = (0..<80).map { n in
            item(String(format: "i%02d", n), expires: CalendarDate.adding(n + 1, to: today))
        }
        let got = ExpiryReminders.scheduled(items: items, today: today, daysAhead: 3)

        XCTAssertEqual(got.count, 60)
        // i00 and i01 expire in one and two days, so their warning day has
        // already passed and they are correctly absent — the window opens at
        // i02. The soonest of what remains survive, not the first sixty the
        // caller happened to pass.
        XCTAssertEqual(got.first?.id, "i02")
        XCTAssertEqual(got.last?.id, "i61")
    }

    func testOrderIsStableWhenDatesTie() {
        // Rescheduling wipes and rebuilds. Without a tiebreak, which items make
        // the cut could change between two runs over identical data.
        let tied = (0..<5).map { item("z\($0)", expires: "2026-09-10") }
        let a = ExpiryReminders.scheduled(items: tied.reversed(), today: today, daysAhead: 3, limit: 3)
        let b = ExpiryReminders.scheduled(items: tied, today: today, daysAhead: 3, limit: 3)
        XCTAssertEqual(a.map(\.id), b.map(\.id))
        XCTAssertEqual(a.map(\.id), ["z0", "z1", "z2"])
    }

    func testSkipsWhatCannotBeActedOn() {
        let got = ExpiryReminders.scheduled(
            items: [
                item("sin-fecha", expires: nil),
                item("ya-vencido", expires: "2026-09-01"),
                item("vence-hoy", expires: today),
                // Warning day already passed: firing now would arrive as noise
                // the moment the app opens, not as a warning.
                item("manana", expires: "2026-09-05"),
                item("en-rango", expires: "2026-09-08"),
            ],
            today: today, daysAhead: 3)

        XCTAssertEqual(got.map(\.id), ["en-rango"])
    }

    func testEverythingFitsWhenItFits() {
        let items = (0..<10).map { item("i\($0)", expires: CalendarDate.adding($0 + 4, to: today)) }
        XCTAssertEqual(
            ExpiryReminders.scheduled(items: items, today: today, daysAhead: 3).count, 10)
    }
}
