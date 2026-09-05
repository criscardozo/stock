import FirebaseFirestore
import Foundation

/// `DocumentSnapshot` -> `(id, data)`, and nothing else.
///
/// The decoding itself is in `Domain/DocumentDecoding.swift`, where it can be
/// tested: it never needed a snapshot, only the dictionary inside one. This
/// file exists so the call sites keep reading `Item.init(document:)` and so
/// that Firestore stays confined to `Data/`.

private extension DocumentSnapshot {
    /// `nil` for a document that does not exist, which is distinct from one
    /// that exists and fails to decode — both end up `nil` here, and the
    /// difference has never mattered to a caller.
    var payload: (String, [String: Any])? {
        guard let data = data() else { return nil }
        return (documentID, data)
    }
}

extension Item {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        self.init(id: id, data: data)
    }
}

extension Recipe {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        self.init(id: id, data: data)
    }
}

extension MealPlan {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        self.init(id: id, data: data)
    }
}

extension ShoppingEntry {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        self.init(id: id, data: data)
    }
}

extension Household {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        self.init(id: id, data: data)
    }
}

extension Move {
    init?(document: DocumentSnapshot) {
        guard let (id, data) = document.payload else { return nil }
        // The one field this layer has to translate: `Domain` knows `Date` and
        // not `Timestamp`, which is what keeps it compilable without the SDK.
        var payload = data
        if let at = payload["at"] as? Timestamp { payload["at"] = at.dateValue() }
        self.init(id: id, data: payload)
    }
}
