import XCTest

/// The signing-expiry logic can never exercise itself in a Simulator build —
/// there is no `embedded.mobileprovision` in the bundle — so the two fragile
/// parts are tested directly: slicing the plist out of the CMS container, and
/// the day arithmetic that decides what the row says.
final class SigningExpiryTests: XCTestCase {
    /// A `.mobileprovision` is a binary CMS blob with an XML plist buried in
    /// the middle. This reproduces that shape: binary noise, the plist, a tail.
    private func makeProfile(expiry: String) -> Data {
        var data = Data([0x30, 0x82, 0x0A, 0x00, 0x06, 0x09, 0x2A, 0x86])
        data.append(
            Data(
                """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" \
                "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                <plist version="1.0">
                <dict>
                  <key>AppIDName</key><string>XC dev cardozo stock</string>
                  <key>TimeToLive</key><integer>7</integer>
                  <key>ExpirationDate</key><date>\(expiry)</date>
                </dict>
                </plist>
                """.utf8))
        data.append(Data([0x00, 0x01, 0xA0, 0x82, 0x03, 0xFF]))
        return data
    }

    func testReadsExpiryFromAProfileBlob() throws {
        let parsed = try XCTUnwrap(
            SigningExpiry.expiry(fromProfile: makeProfile(expiry: "2026-08-24T10:30:00Z")))

        var components = DateComponents()
        components.year = 2026
        components.month = 8
        components.day = 24
        components.hour = 10
        components.minute = 30
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(parsed, calendar.date(from: components))
    }

    func testReturnsNilWithoutAPlist() {
        XCTAssertNil(SigningExpiry.expiry(fromProfile: Data([0x30, 0x82, 0x00])))
        XCTAssertNil(SigningExpiry.expiry(fromProfile: Data()))
    }

    func testDayArithmeticIsCalendarDays() {
        let calendar = Calendar.current
        // 23:59 today to 00:01 tomorrow is two minutes and one whole day: the
        // row must say "mañana", not "hoy", or it under-reports on every
        // evening of the week.
        let tonight = calendar.date(bySettingHour: 23, minute: 59, second: 0, of: Date())!
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: tonight)!
        XCTAssertEqual(SigningExpiry.daysRemaining(expiry: tomorrow, now: tonight), 1)

        let expired = calendar.date(byAdding: .day, value: -1, to: Date())!
        XCTAssertEqual(SigningExpiry.daysRemaining(expiry: expired, now: Date()), -1)
    }
}
