import SwiftUI
import WidgetKit

/// Tonight's dinner on the home screen.
///
/// The one thing worth a glance without opening anything, and the piece of
/// Phase 4 that was named and never built.
struct MealEntry: TimelineEntry {
    var date: Date
    var snapshot: MealSnapshot?
    /// False when the snapshot is for another day — see `isCurrent`.
    var current: Bool
}

struct MealProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealEntry {
        MealEntry(date: Date(), snapshot: .sample, current: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (MealEntry) -> Void) {
        completion(entry(now: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MealEntry>) -> Void) {
        let now = Date()
        // One entry, refreshed at the next midnight in the household's zone.
        // A dinner does not change through the day, but the DAY does, and that
        // is exactly when a stale snapshot starts lying.
        let zone = MealSnapshot.load().flatMap { TimeZone(identifier: $0.timezone) } ?? .current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let midnight = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry(now: now)], policy: .after(midnight)))
    }

    private func entry(now: Date) -> MealEntry {
        let snapshot = MealSnapshot.load()
        return MealEntry(
            date: now,
            snapshot: snapshot,
            current: snapshot?.isCurrent(now: now) ?? false
        )
    }
}

struct MealWidgetView: View {
    var entry: MealEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Hoy")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.7)
                .foregroundStyle(.secondary)

            Text(headline)
                .font(.system(size: 19, weight: .bold))
                .minimumScaleFactor(0.7)
                .lineLimit(3)

            Spacer(minLength: 0)

            if let note {
                Text(note)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(.background, for: .widget)
    }

    /// The answer, or the honest absence of one.
    private var headline: String {
        guard let snapshot = entry.snapshot else { return "Abrí Stock" }
        guard entry.current else { return "Sin datos de hoy" }
        return snapshot.title ?? "Sin plan"
    }

    private var note: String? {
        guard let snapshot = entry.snapshot else {
            return "El plan se sincroniza cuando abrís la app."
        }
        guard entry.current else {
            // Says WHY rather than showing yesterday's dinner as if it were
            // tonight's. The widget cannot read Firestore — it has no way to
            // sign in — so its only source is the last time the app ran.
            return "Lo último que guardó la app es de otro día."
        }
        if snapshot.cooked { return "Ya la cocinaron." }
        guard snapshot.isRecipe, let missing = snapshot.missing else { return nil }
        if missing == 0 { return "Está todo." }
        return missing == 1 ? "Falta 1 ingrediente." : "Faltan \(missing) ingredientes."
    }
}

struct MealWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StockMealWidget", provider: MealProvider()) { entry in
            MealWidgetView(entry: entry)
        }
        .configurationDisplayName("Qué se cocina hoy")
        .description("La cena de hoy y si falta algo para hacerla.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
