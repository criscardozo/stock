import SwiftUI

/// What's for dinner — the one thing worth a glance rather than a session.
struct WatchTodayView: View {
    @Environment(WatchLink.self) private var link

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let note = link.todayNote {
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(WatchTheme.ink3)
            }
            if let today = link.today {
                Text(today)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(WatchTheme.ink)
                    .minimumScaleFactor(0.6)
            } else {
                Text("Sin plan")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(WatchTheme.ink)
                Text("Nada agendado para hoy.")
                    .font(.system(size: 12))
                    .foregroundStyle(WatchTheme.ink3)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(WatchTheme.ground.gradient, for: .navigation)
        .navigationTitle("Hoy")
    }
}
