import SwiftUI

/// The design system, from docs/design/tokens.md. Same values as the web's
/// Tailwind theme — do not invent colours here.
enum Theme {
    static let ground = Color(hex: 0xF3F4EE)
    static let surface = Color(hex: 0xFCFCF8)

    static let ink = Color(hex: 0x1B2119)
    static let ink2 = Color(hex: 0x7C8578)
    static let ink3 = Color(hex: 0xAFB6AA)
    static let ink4 = Color(hex: 0xCFD3C9)

    static let line = Color(hex: 0x1B2119, alpha: 0.09)
    static let lineSoft = Color(hex: 0x1B2119, alpha: 0.07)
    static let lineStrong = Color(hex: 0x1B2119, alpha: 0.18)
    static let track = Color(hex: 0x1B2119, alpha: 0.11)
    static let neutralSoft = Color(hex: 0x1B2119, alpha: 0.07)

    static let primary = Color(hex: 0x2E9E5B)
    static let primaryDeep = Color(hex: 0x1D7A43)
    static let primarySoft = Color(hex: 0x2E9E5B, alpha: 0.13)

    static let danger = Color(hex: 0xE5484D)
    static let dangerDeep = Color(hex: 0xC0353A)
    static let dangerSoft = Color(hex: 0xE5484D, alpha: 0.13)

    static let memberA = Color(hex: 0x2A6FDB)
    static let memberB = Color(hex: 0xE0447C)

    /// Category hues: foreground and its ~14% tint.
    static func hue(_ name: String?) -> (fg: Color, bg: Color) {
        switch name ?? "violet" {
        case "olive": return (Color(hex: 0x6E7C1C), Color(hex: 0x8A9B23, alpha: 0.14))
        case "wine": return (Color(hex: 0x9E3E53), Color(hex: 0xB4485F, alpha: 0.14))
        case "blue": return (Color(hex: 0x286D91), Color(hex: 0x2E7FA8, alpha: 0.14))
        case "amber": return (Color(hex: 0x996A0C), Color(hex: 0xC98A12, alpha: 0.15))
        case "teal": return (Color(hex: 0x25808B), Color(hex: 0x2E9BA8, alpha: 0.15))
        case "magenta": return (Color(hex: 0xA34E80), Color(hex: 0xC0679B, alpha: 0.15))
        case "brown": return (Color(hex: 0x8F5626), Color(hex: 0xB5733A, alpha: 0.15))
        case "green": return (primaryDeep, primarySoft)
        default: return (Color(hex: 0x6B54A0), Color(hex: 0x8B6FBE, alpha: 0.15))
        }
    }

    /// The design is drawn in Material Symbols; iOS speaks SF Symbols. This is
    /// the translation, and the fallback is a box rather than a blank space —
    /// a missing glyph should look like a missing glyph, not like nothing.
    static func symbol(_ material: String) -> String {
        switch material {
        case "nutrition": return "leaf.fill"
        case "kebab_dining": return "fork.knife"
        case "set_meal": return "fish.fill"
        case "egg": return "oval.fill"
        case "bakery_dining", "coffee": return "cup.and.saucer.fill"
        case "local_dining": return "takeoutbag.and.cup.and.straw.fill"
        case "ac_unit": return "snowflake"
        case "local_bar": return "wineglass.fill"
        case "cookie": return "birthday.cake.fill"
        case "grocery": return "basket.fill"
        case "cleaning_services": return "sparkles"
        case "soap": return "drop.fill"
        case "dry": return "wind"
        case "kitchen": return "refrigerator.fill"
        case "shelves": return "cabinet.fill"
        case "local_laundry_service": return "washer.fill"
        case "shower": return "shower.fill"
        case "inventory_2": return "shippingbox.fill"
        case "restaurant": return "fork.knife.circle.fill"
        case "ramen_dining": return "takeoutbag.and.cup.and.straw.fill"
        case "rice_bowl": return "bowl.fill"
        case "oven_gen": return "oven.fill"
        case "lunch_dining": return "takeoutbag.and.cup.and.straw.fill"
        case "local_pizza": return "triangle.fill"
        case "soup_kitchen": return "bowl.fill"
        case "egg_alt": return "oval.fill"
        case "outdoor_grill": return "flame.fill"
        default: return "shippingbox.fill"
        }
    }
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

extension Font {
    /// Outfit isn't bundled; the system face at these weights carries the same
    /// tone, and shipping a webfont to get closer isn't worth the megabytes.
    static func stock(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}
