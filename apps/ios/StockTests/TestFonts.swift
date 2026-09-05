import CoreText
import Foundation

/// Registers the app's font into the test process.
///
/// Deliberately NOT a `setUp` on one test class. Registration is process-wide,
/// so once any class does it every other class sees the font — which means a
/// second font test that forgets to register still finds a font, measures the
/// SYSTEM face, and passes. Gastos Diarios hit exactly that: their scaling
/// tests were measuring the fallback because the class doing the registering
/// was in a file that was not running.
///
/// A test bundle has no `UIAppFonts`, which is why this has to happen at all.
enum TestFonts {
    /// Why it did or did not work.
    ///
    /// Not a `Bool`. "The .ttf was never copied into the bundle" and "the file
    /// is there and CoreText refused it" are different problems with different
    /// fixes — one is a line in project.yml, the other is the font file — and a
    /// single `false` made the test message assert the first while knowing
    /// neither. Gastos Diarios found the same conflation on their side, where
    /// it was live.
    enum Outcome: Equatable {
        case registered
        case resourceMissing
        case registrationFailed
    }

    private static let outcome: Outcome = {
        guard let url = Bundle(for: Marker.self)
            .url(forResource: "Outfit-Variable", withExtension: "ttf")
        else { return .resourceMissing }
        return CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            ? .registered
            : .registrationFailed
    }()

    /// Idempotent — the work happens once, on first touch.
    @discardableResult
    static func register() -> Outcome { outcome }

    /// Only exists to give `Bundle(for:)` a class in this bundle.
    private final class Marker {}
}
