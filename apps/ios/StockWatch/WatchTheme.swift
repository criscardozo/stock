import SwiftUI

/// The watch target shares no code with the phone: no Firebase, no domain, no
/// Theme.swift. watchOS always renders dark, so only the dark half of each token
/// exists here — the light values would be dead weight and a lie about what the
/// screen does.
///
/// Values from `docs/design/project/Stock - Dark.dc.html`, same as Theme.swift.
enum WatchTheme {
    static let ground = Color(hex: 0x161616)
    static let surface = Color(hex: 0x212121)
    static let ink = Color(hex: 0xEEEEEE)
    static let ink2 = Color(hex: 0xA1A1A1)
    static let ink3 = Color(hex: 0x919191)
    static let primary = Color(hex: 0x45BC72)
    static let primaryDeep = Color(hex: 0x7FD79E)
    /// Text on the accent: near-black, because in dark the accent is the light one.
    static let onPrimary = Color(hex: 0x0F1A12)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
