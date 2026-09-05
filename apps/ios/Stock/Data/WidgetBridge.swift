import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// One-way app → widget handoff: what is for dinner tonight.
///
/// A small JSON snapshot in the shared app-group defaults, the same shape
/// Gastos Diarios uses for its budget. The widget extension keeps its own copy
/// of this struct because it shares no code with the app target — keep the two
/// in sync by hand.
///
/// It carries the DATE it describes rather than just the meal. A widget is the
/// one surface that keeps showing yesterday's answer with total confidence: if
/// the app has not run since, the snapshot is stale and the widget has to be
/// able to notice that itself rather than announce last night's dinner.
enum WidgetBridge {
    struct Snapshot: Codable, Equatable {
        /// The recipe's title, or a free label ("Afuera", "Sobras"). Nil when
        /// nothing is planned, which is a real answer and not an error.
        var title: String?
        /// A real recipe as opposed to a typed-in label — only a recipe has
        /// ingredients, so only a recipe can be short of them.
        var isRecipe: Bool
        /// Ingredients missing. `nil` when it cannot be known: a label has
        /// none, and a recipe whose items have not loaded yet has an unknown
        /// count, which must not render as zero.
        var missing: Int?
        var cooked: Bool
        /// The day this describes, "YYYY-MM-DD" in the household timezone.
        var date: String
        var timezone: String
        var updatedAtEpoch: Int
    }

    static let appGroupId = "group.dev.cardozo.stock"
    static let snapshotKey = "mealSnapshot"

    /// Writes (or clears, when nil) the snapshot and asks WidgetKit to redraw.
    static func publish(_ snapshot: Snapshot?) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        if let snapshot, let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: snapshotKey)
        } else {
            defaults.removeObject(forKey: snapshotKey)
        }
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}
