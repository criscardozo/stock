import XCTest

/// The caps this app enforces, against the ones the rules refuse.
///
/// The same mechanism the web uses in `parity.test.ts`, for the same reason: a
/// number written twice and held together by a comment drifts. Move one and its
/// own test is updated because the test asserts the literal; the other side
/// stays put, both suites stay green, and the two clients disagree about what
/// they will let you type.
///
/// So this READS `firestore.rules` — a resource of the test target — instead of
/// repeating the numbers. If one fails, make the values equal; do not update
/// the expectation.
final class FieldLimitsTests: XCTestCase {
    private static func rules() throws -> String {
        let url = try XCTUnwrap(
            Bundle(for: FieldLimitsTests.self).url(forResource: "firestore", withExtension: "rules"),
            "firestore.rules is not a resource of StockTests — check project.yml"
        )
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The number in the first match of `pattern`, searching from `after`.
    ///
    /// `after` exists because `name` is capped twice — 60 for a household and 80
    /// for an item — and reading by first match alone would have made both
    /// agree on 60 and looked perfectly fine.
    private func cap(_ pattern: String, after marker: String? = nil) throws -> Int {
        let text = try Self.rules()
        let start = marker.flatMap { text.range(of: $0)?.upperBound } ?? text.startIndex
        let slice = String(text[start...])
        let regex = try NSRegularExpression(pattern: pattern)
        let match = try XCTUnwrap(
            regex.firstMatch(in: slice, range: NSRange(slice.startIndex..., in: slice)),
            "no encontré \(pattern) en firestore.rules"
        )
        return try XCTUnwrap(Int(slice[Range(match.range(at: 1), in: slice)!]))
    }

    func testTheHouseholdNameCapMatches() throws {
        XCTAssertEqual(
            FieldLimits.householdName,
            try cap(#"d\.name is string && d\.name\.size\(\) > 0 && d\.name\.size\(\) <= (\d+)"#,
                    after: "match /households/{hid}")
        )
    }

    func testTheItemNameCapMatches() throws {
        XCTAssertEqual(
            FieldLimits.itemName,
            try cap(#"d\.name is string && d\.name\.size\(\) > 0 && d\.name\.size\(\) <= (\d+)"#,
                    after: "match /items/{itemId}")
        )
    }

    func testTheItemNameEsCapMatches() throws {
        XCTAssertEqual(
            FieldLimits.itemNameEs,
            try cap(#"d\.nameEs is string && d\.nameEs\.size\(\) <= (\d+)"#)
        )
    }

    func testTheShoppingLabelCapMatches() throws {
        XCTAssertEqual(
            FieldLimits.shoppingLabel,
            try cap(#"d\.label is string && d\.label\.size\(\) > 0 && d\.label\.size\(\) <= (\d+)"#)
        )
    }

    // MARK: - The counting itself

    func testItCountsTheTrimmedString() {
        // What the rules see. Warning about trailing spaces would warn about
        // something that never reaches the server.
        XCTAssertEqual(FieldLimits.overBy("  abc  ", 3), 0)
        XCTAssertEqual(FieldLimits.overBy("abcd", 3), 1)
        XCTAssertEqual(FieldLimits.overBy("", 3), 0)
    }

    func testTheNoteIsAbsentUntilThereIsSomethingToSay() {
        XCTAssertNil(FieldLimits.note("abc", 3))
        XCTAssertEqual(FieldLimits.note("abcd", 3), "Te pasaste por 1 carácter. El máximo es 3.")
        XCTAssertEqual(FieldLimits.note("abcde", 3), "Te pasaste por 2 caracteres. El máximo es 3.")
    }
}
