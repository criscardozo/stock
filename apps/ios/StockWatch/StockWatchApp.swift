import SwiftUI

@main
struct StockWatchApp: App {
    @State private var link = WatchLink()

    var body: some Scene {
        WindowGroup {
            TabView {
                NavigationStack { WatchListView() }
                NavigationStack { WatchTodayView() }
            }
            .tabViewStyle(.verticalPage)
            .environment(link)
            .tint(WatchTheme.primary)
        }
    }
}
