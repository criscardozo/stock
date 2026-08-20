import UIKit
import XCTest

// No `@testable import Stock`: Theme.swift is compiled INTO this target, the
// same way the domain files are. Importing the app target would drag Firebase
// in and make these tests wait on an SDK download to check a glyph name.

/// The icon map, checked against reality.
///
/// `Image(systemName:)` renders NOTHING for a name SF Symbols does not ship —
/// no crash, no warning, just a hole in the row where the category badge should
/// be. And two categories quietly sharing a glyph is just as invisible: Panadería
/// and Café both drew a coffee cup for weeks because there is no croissant
/// symbol and the fallback was never revisited.
final class SymbolsTests: XCTestCase {
    /// Every icon the shared catalogue can ask for.
    ///
    /// The JSON holds ARRAYS under "categories" / "locations". Reading them as
    /// dictionaries fails quietly and yields nothing, which made the first
    /// version of these tests pass over an empty list — green while the bug it
    /// was written for sat right there. Hence `testTheFixturesAreNotEmpty`.
    private func catalogueIcons() throws -> [(label: String, icon: String)] {
        var out: [(String, String)] = []
        for file in ["categories", "locations"] {
            let url = try XCTUnwrap(
                Bundle(for: Self.self).url(forResource: file, withExtension: "json"),
                "falta \(file).json en el bundle de tests")
            let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
            let root = json as? [String: Any]
            let entries = (root?[file] as? [[String: Any]]) ?? []
            for entry in entries {
                guard let icon = entry["icon"] as? String else { continue }
                out.append(((entry["name"] as? String) ?? icon, icon))
            }
        }
        return out
    }

    func testTheFixturesAreNotEmpty() throws {
        // Without this, every assertion below is a loop over nothing.
        let icons = try catalogueIcons()
        XCTAssertGreaterThan(icons.count, 15, "el catálogo compartido no se está leyendo")
    }

    func testEverySymbolInTheMapExists() throws {
        for (label, icon) in try catalogueIcons() {
            let symbol = Theme.symbol(icon)
            XCTAssertNotNil(
                UIImage(systemName: symbol),
                "\(label): «\(symbol)» no existe en SF Symbols, así que se dibuja vacío")
        }
    }

    func testTwoCategoriesNeverShareAGlyph() throws {
        var bySymbol: [String: [String]] = [:]
        for (label, icon) in try catalogueIcons() {
            bySymbol[Theme.symbol(icon), default: []].append(label)
        }
        // Freezer and Congelados both mean frozen and both are ac_unit in the
        // shared catalogue — same icon by construction, not by accident.
        for (symbol, labels) in bySymbol where labels.count > 1 {
            let icons = Set(try catalogueIcons().filter { labels.contains($0.label) }.map(\.icon))
            XCTAssertEqual(
                icons.count, 1,
                "\(labels.joined(separator: " y ")) comparten «\(symbol)» viniendo de iconos distintos")
        }
    }

    func testTheFallbackIsVisible() {
        // An unmapped icon must still draw something, or a new category added to
        // the shared catalogue shows a hole until someone notices.
        XCTAssertNotNil(UIImage(systemName: Theme.symbol("un_icono_que_no_existe")))
    }
}
