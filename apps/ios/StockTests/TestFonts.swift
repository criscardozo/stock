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
    private static let registered: Bool = {
        guard let url = Bundle(for: Marker.self)
            .url(forResource: "Outfit-Variable", withExtension: "ttf")
        else { return false }
        return CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }()

    /// Idempotent — the work happens once, on first touch.
    /// Returns false when the resource is not in the bundle at all, which is a
    /// different failure from the font not resolving and is reported as one.
    @discardableResult
    static func register() -> Bool { registered }

    /// Only exists to give `Bundle(for:)` a class in this bundle.
    private final class Marker {}
}
