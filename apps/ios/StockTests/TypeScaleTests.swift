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

    func testHalfPointNeighboursShareAnAnchor() {
        // The rule stated as a property instead of a list, which is Gastos
        // Diarios' formulation: a size and its floor always land on the same
        // style. That is what makes 11/11.5 and 14/14.5 grow together, and it
        // keeps holding for a size nobody has drawn yet.
        for tenths in stride(from: 90, through: 400, by: 1) {
            let size = CGFloat(tenths) / 10
            XCTAssertEqual(
                AppFont.style(for: size),
                AppFont.style(for: size.rounded(.down)),
                "\(size) does not share an anchor with \(size.rounded(.down))"
            )
        }
    }

    func testSymbolsAreUntouchedAtTheDefaultSize() {
        // The content size is passed in rather than read off the device. The
        // first version of this test did read it, and failed reporting 29.7 for
        // an 11pt icon — which was true, because the simulator had been left at
        // accessibility-extra-large by the previous experiment. The test was
        // measuring the machine, not the code.
        let normal = UITraitCollection(preferredContentSizeCategory: .large)
        for size in [11, 13, 15, 17, 34] as [CGFloat] {
            XCTAssertEqual(AppFont.scaledSymbol(size, traits: normal), size, accuracy: 0.5)
        }
    }

    func testSymbolsGrowWhenSomebodyAsksForLargerText() {
        // The half that matters. An icon drawn with `.system(size:)` never
        // grows, so at larger text it drifts from its label and — when it is the
        // whole content of a button — becomes a smaller target for the person
        // who most needs a bigger one.
        let big = UITraitCollection(preferredContentSizeCategory: .accessibilityExtraLarge)
        for size in [11, 13, 15, 17, 34] as [CGFloat] {
            XCTAssertGreaterThan(
                AppFont.scaledSymbol(size, traits: big),
                size,
                "\(size)pt did not grow at an accessibility size"
            )
        }
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
