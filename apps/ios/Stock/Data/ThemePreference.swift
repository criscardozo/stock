import SwiftUI

/// Manual appearance override, per device — the same three options the web keeps
/// in Ajustes, stored under the same idea: "system" is the absence of an
/// override, not a third value to apply.
///
/// Lives in UserDefaults rather than the household doc on purpose: the two
/// members of a house do not have to agree on dark mode, and a preference that
/// syncs would make one of them wrong every night.
enum ThemePreference: String, CaseIterable {
    case system, light, dark

    /// The key `@AppStorage` reads in RootView and SettingsScreen.
    static let key = "stock.theme"

    var label: String {
        switch self {
        case .system: return "Sistema"
        case .light: return "Claro"
        case .dark: return "Oscuro"
        }
    }

    /// nil means "follow the system", which is what SwiftUI wants for no override.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
