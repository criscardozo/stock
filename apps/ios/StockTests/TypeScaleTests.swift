import SwiftUI
import XCTest

/// Which text style each size scales against.
///
/// The app draws type at hand-measured sizes — 11.5, 14.5, 26 — none of which
/// are Apple's. `relativeTo:` needs a style anyway, and the one it gets decides
/// how the size GROWS when somebody turns on larger text: anchored to a caption
/// a 12pt label grows like a caption, anchored to a title it grows like a
/// title, and the row it sits in stops fitting.
///
/// Every size actually used in the app is listed, so adding one that lands on
/// the wrong side of a boundary shows up here rather than on a phone.
final class TypeScaleTests: XCTestCase {
    func testTheSmallPrintAnchorsToCaptions() {
        // The pairs half a point apart share an anchor on purpose: they are the
        // same size to the eye and sit in the same rows, so splitting them
        // would make one label outgrow its neighbour at larger text.
        XCTAssertEqual(AppFont.style(for: 11), .caption2)
        XCTAssertEqual(AppFont.style(for: 11.5), .caption2)
        XCTAssertEqual(AppFont.style(for: 12), .caption)
        XCTAssertEqual(AppFont.style(for: 13), .footnote)
        XCTAssertEqual(AppFont.style(for: 14), .footnote)
        XCTAssertEqual(AppFont.style(for: 14.5), .footnote)
    }

    func testTheReadingSizesAnchorToBodyAndItsNeighbours() {
        XCTAssertEqual(AppFont.style(for: 15), .subheadline)
        XCTAssertEqual(AppFont.style(for: 16), .callout)
        XCTAssertEqual(AppFont.style(for: 17), .body)
        XCTAssertEqual(AppFont.style(for: 18), .body)
    }

    func testTheHeadingsAnchorToTitles() {
        // 26 is 4pt above title2's default and 2pt below title's, so it
        // anchors up rather than down.
        XCTAssertEqual(AppFont.style(for: 26), .title)
        XCTAssertEqual(AppFont.style(for: 28), .title)
        XCTAssertEqual(AppFont.style(for: 30), .title)
    }

    func testTheScaleIsMonotonic() {
        // The property behind the table: a bigger size never anchors to a
        // smaller style. A boundary typed backwards would make one size in the
        // middle grow slower than the one below it, which reads as a rendering
        // bug rather than as a mapping mistake.
        let order: [Font.TextStyle] = [
            .caption2, .caption, .footnote, .subheadline, .callout, .body, .title3, .title2, .title,
        ]
        var previous = -1
        for size in stride(from: CGFloat(9), through: 40, by: 0.5) {
            let index = order.firstIndex(of: AppFont.style(for: size))
            XCTAssertNotNil(index, "size \(size) mapped outside the ordered scale")
            XCTAssertGreaterThanOrEqual(index ?? -1, previous, "size \(size) went backwards")
            previous = index ?? previous
        }
    }
}
