import CoreText
import UIKit
import XCTest

/// That the app's own font actually resolves under the name it asks for.
///
/// This is the test that was missing. `Outfit-Variable.ttf` is a variable font,
/// and iOS registers one under its family plus its DEFAULT instance — `Outfit`
/// and `Outfit-Thin`. It does not register the named instances, so the
/// `Outfit-Regular` the code used to ask for resolved to nil, `available` was
/// false, and every label in the app fell through to the system rounded face.
/// For months. Nothing failed, because nothing looked.
///
/// A test bundle has no `UIAppFonts`, so the file is a resource here and gets
/// registered by hand — through `TestFonts`, and not from a `setUp` on this
/// class. See the note there: registration is process-wide, so a class that
/// forgets still finds a font, measures the system face, and passes.
final class FontLoadingTests: XCTestCase {
    override class func setUp() {
        super.setUp()
        TestFonts.register()
    }

    func testTheFontFileIsInThisBundleAtAll() {
        // First, and separate, so that among the assertions a missing resource
        // knocks over there is one whose message names the build phase. The
        // others cannot tell the two causes apart — that is not what makes this
        // useful. What makes it useful is that it sends you to the right file.
        switch TestFonts.register() {
        case .registered:
            break
        case .resourceMissing:
            XCTFail("Outfit-Variable.ttf is not a resource of StockTests — check project.yml")
        case .registrationFailed:
            XCTFail("Outfit-Variable.ttf is in the bundle and CoreText refused it — check the file")
        }
    }

    func testTheNameTheAppAsksForResolves() {
        XCTAssertNotNil(
            UIFont(name: AppFont.familyName, size: 12),
            "\(AppFont.familyName) does not resolve — the app is rendering in the fallback"
        )
    }

    func testTheNamedInstancesStillDoNotResolve() {
        // The other half, and the reason the constant is a family: asking for
        // one of these is what the bug WAS. If a future font file does register
        // them, this fails and says so — which is a fact worth learning rather
        // than a test worth deleting.
        for name in ["Outfit-Regular", "Outfit-SemiBold", "Outfit-Bold"] {
            XCTAssertNil(
                UIFont(name: name, size: 12),
                "\(name) resolves now — the font file changed, revisit AppFont"
            )
        }
    }

    func testTheFamilyLandsOnRegularAndNotOnThin() {
        // The risk this file carries. Its `wght` axis runs 100…900 with a
        // DEFAULT of 100, which is why the registered instance is called
        // Outfit-Thin — and if iOS ever resolved the family to that default,
        // every screen would render hairline. It does not: it lands on Regular.
        // Worth pinning, because "the text went very thin" is the kind of thing
        // that gets blamed on the design rather than on the font.
        guard let font = UIFont(name: AppFont.familyName, size: 20) else {
            return XCTFail("\(AppFont.familyName) does not resolve")
        }
        XCTAssertEqual(font.fontDescriptor.object(forKey: .face) as? String, "Regular")
    }

    func testTheFileCanActuallyExpressAWeight() {
        // That the axis works at all, measured by width rather than by reading
        // a descriptor back: bold letterforms are wider.
        //
        // Deliberately NOT a claim about SwiftUI. A first version of this test
        // asked for bold through `UIFontDescriptor`'s weight TRAIT and failed —
        // measured, the trait does nothing to this font (same width, same
        // "Regular" face) while the variation axis does (174.20 vs 168.27,
        // "Bold"). The app goes through SwiftUI's `.weight()`, whose mechanism
        // is not public; that it works is covered by looking at the screen, and
        // this covers the file being able to do it in the first place.
        let text = "Milanesas con puré" as NSString
        let width = { (font: UIFont) in text.size(withAttributes: [.font: font]).width }
        guard let regular = UIFont(name: AppFont.familyName, size: 20) else {
            return XCTFail("\(AppFont.familyName) does not resolve")
        }
        // 0x77676874 is 'wght' as a four-character code.
        let bold = UIFont(
            descriptor: regular.fontDescriptor.addingAttributes([
                UIFontDescriptor.AttributeName(rawValue: "NSCTFontVariationAttribute"): [0x7767_6874: 700],
            ]),
            size: 20
        )
        XCTAssertEqual(bold.fontDescriptor.object(forKey: .face) as? String, "Bold")
        XCTAssertGreaterThan(width(bold), width(regular))
    }
}
