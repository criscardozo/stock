import SwiftUI
import UIKit

// MARK: - Colour helpers

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

    /// A colour that follows the system appearance, the way the web's token
    /// blocks do.
    init(light: Color, dark: Color) {
        self.init(
            uiColor: UIColor { traits in
                traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
            })
    }

    static func hex(
        light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1
    ) -> Color {
        Color(light: Color(hex: light, alpha: lightAlpha), dark: Color(hex: dark, alpha: darkAlpha))
    }
}

// MARK: - Design tokens

/// The design system, from `docs/design/project/` — the light screens and
/// `Stock - Dark.dc.html`, which maps every role one to one.
///
/// Dark is not an inverted filter: the accent RISES to a lighter green so it
/// survives on a dark ground, which is why text ON the accent flips from white
/// to near-black (`onPrimary`). Category hues each go up a step of luminosity.
///
/// Same values as the web's Tailwind theme — do not invent colours here.
enum Theme {
    static let ground = Color.hex(light: 0xF3F4EE, dark: 0x141813)
    static let surface = Color.hex(light: 0xFCFCF8, dark: 0x1E231C)

    static let ink = Color.hex(light: 0x1B2119, dark: 0xECEFE9)
    static let ink2 = Color.hex(light: 0x7C8578, dark: 0x9AA396)
    static let ink3 = Color.hex(light: 0x6E776A, dark: 0x8A9386)
    static let ink4 = Color.hex(light: 0x9AA394, dark: 0x4A5247)

    static let line = Color.hex(light: 0x1B2119, dark: 0xECEFE9, lightAlpha: 0.09, darkAlpha: 0.10)
    static let lineSoft = Color.hex(
        light: 0x1B2119, dark: 0xECEFE9, lightAlpha: 0.07, darkAlpha: 0.08)
    static let lineStrong = Color.hex(
        light: 0x1B2119, dark: 0xECEFE9, lightAlpha: 0.18, darkAlpha: 0.20)
    static let track = Color.hex(light: 0x1B2119, dark: 0xECEFE9, lightAlpha: 0.11, darkAlpha: 0.14)
    static let neutralSoft = Color.hex(
        light: 0x1B2119, dark: 0xECEFE9, lightAlpha: 0.07, darkAlpha: 0.08)

    static let primary = Color.hex(light: 0x2E9E5B, dark: 0x45BC72)
    static let primaryDeep = Color.hex(light: 0x1D7A43, dark: 0x7FD79E)
    static let primarySoft = Color.hex(
        light: 0x2E9E5B, dark: 0x45BC72, lightAlpha: 0.13, darkAlpha: 0.15)
    /// Text ON the accent: white in light, near-black in dark.
    static let onPrimary = Color.hex(light: 0xFFFFFF, dark: 0x0F1A12)

    /// The app icon's own gradient, for the mark drawn inside the app. NOT
    /// primary -> primaryDeep: in dark that pair runs light-to-lighter, so the
    /// ramp would flip. These always run bright at the top, like the icon.
    static let markFrom = Color.hex(light: 0x2E9E5B, dark: 0x45BC72)
    static let markTo = Color.hex(light: 0x1D7A43, dark: 0x2E9E5B)
    /// The drawing on that field. The SAME cream in both appearances, unlike
    /// every other token here: the mark is the icon, and the icon does not
    /// repaint itself when the system flips — only the green under it
    /// brightens. Declared as a pair anyway so the token test can hold web and
    /// iOS to it.
    static let markGlyph = Color.hex(light: 0xFCFCF8, dark: 0xFCFCF8)

    static let danger = Color.hex(light: 0xE5484D, dark: 0xFF6B6E)
    static let dangerDeep = Color.hex(light: 0xC0353A, dark: 0xFF8C8E)
    static let dangerSoft = Color.hex(
        light: 0xE5484D, dark: 0xFF6B6E, lightAlpha: 0.13, darkAlpha: 0.14)
    static let onDanger = Color.hex(light: 0xFFFFFF, dark: 0x14170F)

    static let memberA = Color.hex(light: 0x2A6FDB, dark: 0x5B93E8)
    static let memberB = Color.hex(light: 0xE0447C, dark: 0xF06A9B)

    /// Category hues: foreground and its tint. Dark values from the dark
    /// document; teal and magenta never appear there (no screen uses them), so
    /// they follow the rule it states — up a step of luminosity, +0.31 L, which
    /// is the average measured across the six that ARE specified.
    static func hue(_ name: String?) -> (fg: Color, bg: Color) {
        switch name ?? "violet" {
        case "olive":
            return (
                .hex(light: 0x6E7C1C, dark: 0xB8CE55),
                .hex(light: 0x8A9B23, dark: 0xB8CE55, lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "wine":
            return (
                .hex(light: 0x9E3E53, dark: 0xE88DA0),
                .hex(light: 0xB4485F, dark: 0xE88DA0, lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "blue":
            return (
                .hex(light: 0x286D91, dark: 0x7FB8DC),
                .hex(light: 0x2E7FA8, dark: 0x7FB8DC, lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "amber":
            return (
                .hex(light: 0x996A0C, dark: 0xEFBE5C),
                .hex(light: 0xC98A12, dark: 0xEFBE5C, lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "teal":
            return (
                .hex(light: 0x25808B, dark: 0x73CFDA),
                .hex(light: 0x2E9BA8, dark: 0x73CFDA, lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "magenta":
            return (
                .hex(light: 0xA34E80, dark: 0xDBB3CA),
                .hex(light: 0xC0679B, dark: 0xDBB3CA, lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "brown":
            return (
                .hex(light: 0x8F5626, dark: 0xE1AC74),
                .hex(light: 0xB5733A, dark: 0xE1AC74, lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "green":
            return (primaryDeep, primarySoft)
        default:
            return (
                .hex(light: 0x6B54A0, dark: 0xB9A4EE),
                .hex(light: 0x8B6FBE, dark: 0xB9A4EE, lightAlpha: 0.15, darkAlpha: 0.16)
            )
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
        // Panadería and Café must not share a glyph — they are two categories
        // in the same list. SF Symbols has no croissant, so the bakery takes
        // the cake and coffee keeps the cup.
        case "bakery_dining": return "birthday.cake.fill"
        case "coffee": return "cup.and.saucer.fill"
        case "local_dining": return "takeoutbag.and.cup.and.straw.fill"
        case "ac_unit": return "snowflake"
        case "local_bar": return "wineglass.fill"
        case "cookie": return "popcorn.fill"
        case "grocery": return "basket.fill"
        case "cleaning_services": return "bubbles.and.sparkles.fill"
        case "soap": return "hands.and.sparkles.fill"
        // "dry" is Material's tumble-dry mark, used here for the paper aisle.
        case "dry": return "toilet.fill"
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

// MARK: - Type

/// Outfit, the same face the web serves — one 110 KB variable file, so the two
/// apps genuinely look like one product rather than two that agree on colours.
/// Falls back to the system rounded face if the font ever fails to register,
/// which is a wobble in tone rather than a broken screen.
enum AppFont {
    /// The FAMILY, not a static weight.
    ///
    /// `Outfit-Variable.ttf` is one variable file, and iOS registers a variable
    /// font under its family plus its default instance — here `Outfit` and
    /// `Outfit-Thin`. It does not register the named instances. So the
    /// `Outfit-Regular` / `-SemiBold` / `-Bold` this used to ask for resolved to
    /// nil, every one of them, and the whole app quietly rendered in the system
    /// rounded fallback: not Outfit at all, in either weight or shape, for as
    /// long as the font has been in the bundle. Measured at runtime —
    /// `UIFont(name: "Outfit-Regular")` is nil and `UIFont(name: "Outfit")` is
    /// not.
    private static let familyName = "Outfit"
    private static let available: Bool = UIFont(name: familyName, size: 12) != nil

    /// The UIKit style matching a SwiftUI one, for scaling the fallback.
    private static func metrics(for style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .caption2: .caption2
        case .caption: .caption1
        case .footnote: .footnote
        case .subheadline: .subheadline
        case .callout: .callout
        case .title3: .title3
        case .title2: .title2
        case .title: .title1
        case .largeTitle: .largeTitle
        default: .body
        }
    }

    /// The text style this size scales against.
    ///
    /// Roughly the nearest of Apple's own defaults — 11 caption2, 12 caption,
    /// 13 footnote, 15 subheadline, 16 callout, 17 body, 20 title3, 22 title2,
    /// 28 title — because that is what makes the growth feel like the rest of
    /// iOS: a caption and a title do not grow by the same number of points.
    ///
    /// It deviates from pure nearest-anchor in one way, deliberately. This app
    /// draws several pairs half a point apart — 11 and 11.5, 14 and 14.5 — and
    /// pure nearest would split each pair across two styles. Those pairs are
    /// the same size to the eye and usually sit in the same row, so at larger
    /// text one label would outgrow its neighbour and the row would come apart
    /// for no reason a reader could see. Each pair shares an anchor.
    static func style(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<12: .caption2      // 11, 11.5
        case ..<13: .caption       // 12
        case ..<15: .footnote      // 13, 14, 14.5
        case ..<16: .subheadline   // 15
        case ..<17: .callout       // 16
        case ..<19: .body          // 17, 18
        case ..<21: .title3
        case ..<25: .title2
        default: .title            // 26, 28, 30
        }
    }

    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let style = style(for: size)
        guard available else {
            // The fallback scales too. A fallback that silently stops honouring
            // larger text is how the whole app came to ignore Dynamic Type
            // without anything looking wrong.
            let scaled = UIFontMetrics(forTextStyle: metrics(for: style)).scaledValue(for: size)
            return .system(size: scaled, weight: weight, design: .rounded)
        }
        // `relativeTo:` and not `fixedSize:`. The layout IS drawn at specific
        // sizes measured by hand — and it still is: at the default Dynamic Type
        // setting this renders at exactly `size`, byte for byte what fixedSize
        // gave. The difference only appears when somebody has asked for larger
        // text, which is the one case the old comment was choosing to ignore.
        //
        // The weight is applied to the family rather than baked into the name,
        // which is what a variable font is for.
        return .custom(familyName, size: size, relativeTo: style).weight(weight)
    }
}

extension Font {
    static func stock(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        AppFont.font(size, weight)
    }
}
