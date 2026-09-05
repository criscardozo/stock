import XCTest

/// What an answer from Open Food Facts MEANS.
///
/// The lookup used to return an optional, so "they answered and have no such
/// product" and "we never reached them" were the same value — and the scanner
/// said *"tampoco en Open Food Facts"* for both. That is the wrong thing to
/// tell someone standing in a shop with no signal: it says the product does
/// not exist when the truth is nobody asked. The two lead to opposite actions.
///
/// `classify` is the half that can be checked without a network: given a body,
/// which of the two answers is it.
final class OpenFoodFactsTests: XCTestCase {
    private func classify(_ json: String) -> OpenFoodFacts.Lookup {
        OpenFoodFacts.classify(Data(json.utf8))
    }

    func testAProductWithANameIsFound() {
        let result = classify("""
        {"product": {"product_name": "Leche entera", "brands": "La Serenísima, Ilolay",
                     "quantity": "1 L"}}
        """)
        XCTAssertEqual(
            result,
            .found(name: "Leche entera", brand: "La Serenísima", quantity: "1 L")
        )
    }

    func testOnlyTheFirstBrandIsKept() {
        // They return a comma-separated list and the rest is noise on a row
        // that has to fit on a phone.
        guard case let .found(_, brand, _) = classify(
            #"{"product": {"product_name": "X", "brands": " Ilolay , Otra "}}"#
        ) else { return XCTFail("expected found") }
        XCTAssertEqual(brand, "Ilolay")
    }

    func testAnEmptyNameIsNotAProduct() {
        // They do return entries with a blank name. Accepting one puts an item
        // called "" in the catalogue, which is worse than saying nothing.
        XCTAssertEqual(classify(#"{"product": {"product_name": ""}}"#), .unknown)
        XCTAssertEqual(classify(#"{"product": {"brands": "Ilolay"}}"#), .unknown)
    }

    func testTheirNotFoundBodyIsUnknownAndNotAFailure() {
        // What they send for a barcode nobody has catalogued. It is an answer,
        // and it is actionable: type the name in.
        XCTAssertEqual(classify(#"{"status": 0, "status_verbose": "product not found"}"#), .unknown)
    }

    func testRubbishIsUnknownRatherThanACrash() {
        XCTAssertEqual(classify("no es json"), .unknown)
        XCTAssertEqual(classify("[]"), .unknown)
        XCTAssertEqual(classify(""), .unknown)
    }

    func testUnreachableIsNeverProducedByABody() {
        // The distinction this exists for: `unreachable` is decided by the
        // transport, above `classify`, and no response body can produce it.
        // If a body could, the empty-network case would be indistinguishable
        // from a broken one all over again.
        for body in ["", "no es json", #"{"status": 0}"#, #"{"product": {}}"#] {
            XCTAssertNotEqual(classify(body), .unreachable, "body \(body) produced unreachable")
        }
    }

    func testTheProductAccessorOnlyExistsWhenFound() {
        XCTAssertNil(OpenFoodFacts.Lookup.unknown.product)
        XCTAssertNil(OpenFoodFacts.Lookup.unreachable.product)
        XCTAssertEqual(
            OpenFoodFacts.Lookup.found(name: "X", brand: nil, quantity: nil).product?.name, "X"
        )
    }
}
