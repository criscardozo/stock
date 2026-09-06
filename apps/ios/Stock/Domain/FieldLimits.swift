import Foundation

/// The sizes Firestore's rules refuse, mirrored where a form can say so first.
///
/// The rules are the boundary and they do reject — but a rejected write does not
/// LOOK rejected. Firestore applies it to the local cache immediately, so the
/// person watches the thing save and then gets a refusal about it. For one
/// character too many. Saying so at the field is the difference between a
/// constraint and a trap.
///
/// Nothing truncates. Typing past the limit is allowed and the form says by how
/// much, because silently dropping the tail of something somebody wrote is
/// worse than telling them. Same decision as the web, taken there first.
///
/// Only the four fields iOS can actually type into are here — it has no recipe
/// editor, and `brand` has no cap in the rules. `FieldLimitsTests` reads
/// `firestore.rules` and fails if any of these drifts from it.
enum FieldLimits {
    static let householdName = 60
    static let itemName = 80
    static let itemNameEs = 80
    static let shoppingLabel = 80

    /// How far past the limit, counting the way the rules count.
    ///
    /// Trimmed, because that is what every writer here sends: the rules see the
    /// trimmed string, so warning about trailing spaces would be warning about
    /// something that never reaches the server.
    static func overBy(_ value: String, _ limit: Int) -> Int {
        max(0, value.trimmingCharacters(in: .whitespacesAndNewlines).count - limit)
    }

    /// The message, or nil while there is nothing to say.
    static func note(_ value: String, _ limit: Int) -> String? {
        let over = overBy(value, limit)
        guard over > 0 else { return nil }
        let unit = over == 1 ? "carácter" : "caracteres"
        return "Te pasaste por \(over) \(unit). El máximo es \(limit)."
    }
}
