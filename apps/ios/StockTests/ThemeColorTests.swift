import SwiftUI
import UIKit
import XCTest

/// `Color(hex:)` takes a string now, and a string can be parsed WRONG in a way a
/// number cannot.
///
/// `Scanner.scanHexInt64` does not throw: given something it cannot read it
/// leaves the value at 0 and returns false, which nobody checks, and the token
/// renders black. Every screen still builds, every layout still works, and the
/// app is simply the wrong colour — the exact failure the type system used to
/// make impossible when the literal was `0xF4F4F4`.
///
/// So the parse gets measured against arithmetic the test does itself, on
/// numbers written here as numbers. That is the part that cannot be circular: if
/// both sides used `Color(hex:)` the test would agree with any bug.
final class ThemeColorTests: XCTestCase {
    /// What the screen receives: sRGB bytes, 0–255, for one appearance.
    private func bytes(
        _ color: Color, _ style: UIUserInterfaceStyle,
        file: StaticString = #filePath, line: UInt = #line
    ) -> [Int] {
        let resolved = UIColor(color).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        XCTAssertTrue(
            resolved.getRed(&r, green: &g, blue: &b, alpha: &a),
            "the colour is not in an RGB space", file: file, line: line)
        return [r, g, b].map { Int(($0 * 255).rounded()) }
    }

    func testAHexStringParsesToTheBytesTheNumberWouldHaveGiven() {
        // Left side: the string the token file now holds. Right side: the same
        // value as a number, shifted by hand — the way the old init did it.
        XCTAssertEqual(bytes(Color(hex: "#2E9E5B"), .light), [0x2E, 0x9E, 0x5B])
        XCTAssertEqual(bytes(Color(hex: "#F4F4F4"), .light), [0xF4, 0xF4, 0xF4])
        XCTAssertEqual(bytes(Color(hex: "#161616"), .light), [0x16, 0x16, 0x16])
        // Lower case and a missing `#` both have to work: a generator writing
        // these is one string template away from either.
        XCTAssertEqual(bytes(Color(hex: "#45bc72"), .light), [0x45, 0xBC, 0x72])
        XCTAssertEqual(bytes(Color(hex: "45BC72"), .light), [0x45, 0xBC, 0x72])
    }

    func testTheAppearancesAreNotTheSameColourByAccident() {
        // `ground` light vs dark is the pair the whole dark mode rests on. If the
        // parse silently returned 0 both halves would be black and EQUAL, so this
        // catches the failure above a second way, without naming a byte.
        XCTAssertNotEqual(bytes(Theme.ground, .light), bytes(Theme.ground, .dark))
        XCTAssertEqual(bytes(Theme.ground, .light), [0xF4, 0xF4, 0xF4])
        XCTAssertEqual(bytes(Theme.ground, .dark), [0x16, 0x16, 0x16])
        XCTAssertEqual(bytes(Theme.primary, .light), [0x2E, 0x9E, 0x5B])
        XCTAssertEqual(bytes(Theme.primary, .dark), [0x45, 0xBC, 0x72])
    }

    func testAnUnreadableStringIsNotQuietlyBlack() {
        // The failure named at the top, asserted as the thing it actually is: we
        // do not get to claim the parse is safe, only that it is measured. This
        // documents that garbage DOES land on black — so if a token ever renders
        // black, this is the first place to look.
        XCTAssertEqual(bytes(Color(hex: "not a colour"), .light), [0, 0, 0])
    }

    func testAlphaRidesAlongsideTheHexAndNotInsideIt() {
        let faded = UIColor(Color(hex: "#2E9E5B", alpha: 0.5))
            .resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        XCTAssertTrue(faded.getRed(&r, green: &g, blue: &b, alpha: &a))
        XCTAssertEqual(a, 0.5, accuracy: 0.001)
        XCTAssertEqual([r, g, b].map { Int(($0 * 255).rounded()) }, [0x2E, 0x9E, 0x5B])
    }
}
