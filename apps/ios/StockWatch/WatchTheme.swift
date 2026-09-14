import Foundation
import SwiftUI

/// The watch target shares no code with the phone: no Firebase, no domain, no
/// Theme.swift. watchOS always renders dark, so only the dark half of each token
/// exists here — the light values would be dead weight and a lie about what the
/// screen does.
///
/// Values from `docs/design/project/Stock - Dark.dc.html`, same as Theme.swift.
enum WatchTheme {
    static let ground = Color(hex: "#161616")
    static let surface = Color(hex: "#212121")
    static let ink = Color(hex: "#EEEEEE")
    static let ink2 = Color(hex: "#A1A1A1")
    static let ink3 = Color(hex: "#919191")
    static let primary = Color(hex: "#45BC72")
    static let primaryDeep = Color(hex: "#7FD79E")
    /// Text on the accent: near-black, because in dark the accent is the light one.
    static let onPrimary = Color(hex: "#0F1A12")
}

extension Color {
    init(hex: String, alpha: Double = 1) {
        var value: UInt64 = 0
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: alpha
        )
    }
}
