import XCTest

/// Decoding, checked where it fails quietly.
///
/// A wrong field KEY is loud — the screen comes up empty and you notice in
/// seconds. The defaults are the opposite: a category with no `hue` renders in
/// violet and a household with no `planConfig` plans fortnightly from Saturday,
/// both of which look like decisions somebody made. These pin them, and pin the
/// guards that decide a document is unusable rather than half-decoding it.
final class DocumentDecodingTests: XCTestCase {
    // MARK: - Item

    private var minimalItem: [String: Any] {
        ["name": "Leche", "categoryId": "lacteos", "locationId": "heladera", "tracking": "quantity"]
    }

    func testItemNeedsAllFourIdentifyingFields() {
        XCTAssertNotNil(Item(id: "i1", data: minimalItem))
        for missing in ["name", "categoryId", "locationId", "tracking"] {
            var data = minimalItem
            data.removeValue(forKey: missing)
            XCTAssertNil(Item(id: "i1", data: data), "decoded an item with no \(missing)")
        }
    }

    func testItemRejectsATrackingModeItDoesNotKnow() {
        // Not a default: an unknown mode means the document was written by
        // something this build does not understand, and guessing "quantity"
        // would show a counter for a thing that has none.
        var data = minimalItem
        data["tracking"] = "weight"
        XCTAssertNil(Item(id: "i1", data: data))
    }

    func testItemKeepsTheIdItWasGivenAndLeavesAbsentFieldsNil() {
        let item = Item(id: "abc123", data: minimalItem)
        XCTAssertEqual(item?.id, "abc123")
        XCTAssertNil(item?.quantity)
        XCTAssertNil(item?.expiresAt)
        XCTAssertNil(item?.unit)
    }

    func testItemIgnoresAFieldOfTheWrongType() {
        // Firestore is schemaless and the web writes these too. A quantity that
        // arrived as a string must not become 0 — 0 reads as "out" and puts the
        // thing on the shopping list.
        var data = minimalItem
        data["quantity"] = "5"
        XCTAssertNil(Item(id: "i1", data: data)?.quantity)
    }

    // MARK: - Household

    private var minimalHousehold: [String: Any] {
        ["name": "Casa", "memberIds": ["u1", "u2"]]
    }

    func testHouseholdFallsBackToTheDocumentedDefaults() {
        let household = Household(id: "h1", data: minimalHousehold)
        XCTAssertEqual(household?.timezone, "Australia/Sydney")
        XCTAssertEqual(household?.currency, "AUD")
        XCTAssertEqual(household?.planConfig.length, .fortnightly)
        // Saturday, because planning happens on Friday.
        XCTAssertEqual(household?.planConfig.startWeekday, 6)
        XCTAssertEqual(household?.members, [:])
        XCTAssertEqual(household?.categories, [:])
    }

    func testHouseholdKeepsAnExplicitPlanConfigOverTheDefault() {
        var data = minimalHousehold
        data["planConfig"] = ["length": "weekly", "startWeekday": 1]
        let config = Household(id: "h1", data: data)?.planConfig
        XCTAssertEqual(config?.length, .weekly)
        XCTAssertEqual(config?.startWeekday, 1)
    }

    func testHouseholdFallsBackOnAPlanLengthItDoesNotKnow() {
        // Unlike tracking, an unknown length is survivable: the period is only
        // how far ahead the plan reaches, so defaulting beats an empty screen.
        var data = minimalHousehold
        data["planConfig"] = ["length": "monthly"]
        XCTAssertEqual(Household(id: "h1", data: data)?.planConfig.length, .fortnightly)
    }

    func testCategoryDefaultsFillInEverythingButTheName() {
        var data = minimalHousehold
        data["categories"] = ["c1": ["name": "Lácteos"], "c2": ["icon": "egg"]]
        let categories = Household(id: "h1", data: data)?.categories
        // c2 has no name and is dropped rather than shown as "".
        XCTAssertEqual(categories?.count, 1)
        XCTAssertEqual(categories?["c1"]?.icon, "inventory_2")
        XCTAssertEqual(categories?["c1"]?.hue, "violet")
        XCTAssertEqual(categories?["c1"]?.kind, "food")
        // Last, so an unordered category does not silently jump to the top.
        XCTAssertEqual(categories?["c1"]?.sortOrder, 999)
    }

    func testLocationDefaultsMatchCategoryDefaults() {
        var data = minimalHousehold
        data["locations"] = ["l1": ["name": "Heladera"], "l2": [:]]
        let locations = Household(id: "h1", data: data)?.locations
        XCTAssertEqual(locations?.count, 1)
        XCTAssertEqual(locations?["l1"]?.icon, "inventory_2")
        XCTAssertEqual(locations?["l1"]?.hue, "violet")
        XCTAssertEqual(locations?["l1"]?.sortOrder, 999)
    }

    func testMemberWithoutADisplayNameIsDroppedNotBlank() {
        var data = minimalHousehold
        data["members"] = ["u1": ["displayName": "Cristian"], "u2": ["photoURL": "https://x/y.png"]]
        let members = Household(id: "h1", data: data)?.members
        XCTAssertEqual(members?.count, 1)
        XCTAssertEqual(members?["u1"]?.displayName, "Cristian")
        XCTAssertNil(members?["u1"]?.photoURL)
    }

    func testHouseholdNeedsANameAndMembers() {
        XCTAssertNil(Household(id: "h1", data: ["name": "Casa"]))
        XCTAssertNil(Household(id: "h1", data: ["memberIds": ["u1"]]))
    }
}
