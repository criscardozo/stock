import Foundation
import SwiftUI
import UIKit

// MARK: - Colour helpers

extension Color {
    /// Takes the hex as a STRING, `"#RRGGBB"`, and not as a `UInt32` literal.
    ///
    /// The number is the nicer Swift: it cannot hold a typo of the wrong length
    /// and it needs no parsing. It is the wrong shape anyway, because these
    /// values are going to be written by a generator from a `tokens.json` whose
    /// `$value` is a CSS hex string. `0x` would make the generator translate on
    /// the way out, and a translation is a place a value can change.
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

    /// A colour that follows the system appearance, the way the web's token
    /// blocks do.
    init(light: Color, dark: Color) {
        self.init(
            uiColor: UIColor { traits in
                traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
            })
    }

    static func hex(
        light: String, dark: String, lightAlpha: Double = 1, darkAlpha: Double = 1
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
    static let ground = Color.hex(light: "#F4F4F4", dark: "#161616")
    static let surface = Color.hex(light: "#FCFCFC", dark: "#212121")

    static let ink = Color.hex(light: "#1F1F1F", dark: "#EEEEEE")
    static let ink2 = Color.hex(light: "#5A5A5A", dark: "#A1A1A1")
    static let ink3 = Color.hex(light: "#4F4F4F", dark: "#919191")
    static let ink4 = Color.hex(light: "#6F6F6F", dark: "#4A5247")

    static let line = Color.hex(light: "#1F1F1F", dark: "#EEEEEE", lightAlpha: 0.09, darkAlpha: 0.10)
    static let lineSoft = Color.hex(
        light: "#1F1F1F", dark: "#EEEEEE", lightAlpha: 0.07, darkAlpha: 0.08)
    static let lineStrong = Color.hex(
        light: "#1F1F1F", dark: "#EEEEEE", lightAlpha: 0.18, darkAlpha: 0.20)
    static let track = Color.hex(light: "#1F1F1F", dark: "#EEEEEE", lightAlpha: 0.11, darkAlpha: 0.14)
    static let neutralSoft = Color.hex(
        light: "#1F1F1F", dark: "#EEEEEE", lightAlpha: 0.07, darkAlpha: 0.08)

    static let primary = Color.hex(light: "#2E9E5B", dark: "#45BC72")
    static let primaryDeep = Color.hex(light: "#1D7A43", dark: "#7FD79E")
    static let primarySoft = Color.hex(
        light: "#2E9E5B", dark: "#45BC72", lightAlpha: 0.13, darkAlpha: 0.15)
    /// Text ON the accent: white in light, near-black in dark.
    static let onPrimary = Color.hex(light: "#FFFFFF", dark: "#0F1A12")

    /// The app icon's own gradient, for the mark drawn inside the app. NOT
    /// primary -> primaryDeep: in dark that pair runs light-to-lighter, so the
    /// ramp would flip. These always run bright at the top, like the icon.
    static let markFrom = Color.hex(light: "#2E9E5B", dark: "#45BC72")
    static let markTo = Color.hex(light: "#1D7A43", dark: "#2E9E5B")
    /// The drawing on that field. The SAME cream in both appearances, unlike
    /// every other token here: the mark is the icon, and the icon does not
    /// repaint itself when the system flips — only the green under it
    /// brightens. Declared as a pair anyway so the token test can hold web and
    /// iOS to it.
    static let markGlyph = Color.hex(light: "#FCFCFC", dark: "#FCFCFC")

    static let danger = Color.hex(light: "#E5484D", dark: "#FF6B6E")
    static let dangerDeep = Color.hex(light: "#C0353A", dark: "#FF8C8E")
    static let dangerSoft = Color.hex(
        light: "#E5484D", dark: "#FF6B6E", lightAlpha: 0.13, darkAlpha: 0.14)
    static let onDanger = Color.hex(light: "#FFFFFF", dark: "#14170F")

    static let memberA = Color.hex(light: "#2A6FDB", dark: "#5B93E8")
    static let memberB = Color.hex(light: "#E0447C", dark: "#F06A9B")

    /// Category hues: foreground and its tint. Dark values from the dark
    /// document; teal and magenta never appear there (no screen uses them), so
    /// they follow the rule it states — up a step of luminosity, +0.31 L, which
    /// is the average measured across the six that ARE specified.
    static func hue(_ name: String?) -> (fg: Color, bg: Color) {
        switch name ?? "violet" {
        case "olive":
            return (
                .hex(light: "#6E7C1C", dark: "#B8CE55"),
                .hex(light: "#8A9B23", dark: "#B8CE55", lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "wine":
            return (
                .hex(light: "#9E3E53", dark: "#E88DA0"),
                .hex(light: "#B4485F", dark: "#E88DA0", lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "blue":
            return (
                .hex(light: "#286D91", dark: "#7FB8DC"),
                .hex(light: "#2E7FA8", dark: "#7FB8DC", lightAlpha: 0.14, darkAlpha: 0.16)
            )
        case "amber":
            return (
                .hex(light: "#996A0C", dark: "#EFBE5C"),
                .hex(light: "#C98A12", dark: "#EFBE5C", lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "teal":
            return (
                .hex(light: "#25808B", dark: "#73CFDA"),
                .hex(light: "#2E9BA8", dark: "#73CFDA", lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "magenta":
            return (
                .hex(light: "#A34E80", dark: "#DBB3CA"),
                .hex(light: "#C0679B", dark: "#DBB3CA", lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "brown":
            return (
                .hex(light: "#8F5626", dark: "#E1AC74"),
                .hex(light: "#B5733A", dark: "#E1AC74", lightAlpha: 0.15, darkAlpha: 0.16)
            )
        case "green":
            return (primaryDeep, primarySoft)
        default:
            return (
                .hex(light: "#6B54A0", dark: "#B9A4EE"),
                .hex(light: "#8B6FBE", dark: "#B9A4EE", lightAlpha: 0.15, darkAlpha: 0.16)
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
/// Corner radii, by ROLE — `Radius.card`, never a bare 18 at a call site.
///
/// GENERATED from design-system/tokens.json by design-system/emit.py. The two
/// anchors are the only hand-written part: they say where generated code goes,
/// which is a decision, and a decision belongs in the file it affects. The
/// emitter replaces everything between them whole, so a second run writes the
/// same bytes as the first.
///
/// Defining these was half the job; the call sites were the other half and are
/// done — 19 of them, leaving only the watch's own two, which cannot use this
/// enum because StockWatch compiles no phone code.
///
/// The sed that did those 19 also rewrote this very sentence, which used to
/// name the literal form as the thing to replace. Fifth time in one day that a
/// pattern matched prose instead of code, and the first that EDITED it rather
/// than miscounting: the number was 19, the script said 20, and the extra one
/// was a comment describing the thing being changed.
enum Radius {
    // kyber:radius start
    static let card: CGFloat = 18
    static let checkbox: CGFloat = 8
    static let field: CGFloat = 10
    static let nav: CGFloat = 12
    static let panel: CGFloat = 18
    static let segment: CGFloat = 3
    static let sheet: CGFloat = 24
    // kyber:radius end
}

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
    /// Internal, not private, so a test can assert that this exact name still
    /// resolves. The name being wrong is the whole of the bug this comment
    /// describes, and it survived months because nothing checked it.
    static let familyName = "Outfit"
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

    /// A symbol's point size, scaled the same way the text beside it is.
    ///
    /// `traits` exists for tests. `scaledValue(for:)` reads the DEVICE's current
    /// content size, so a test asserting "at the default this is the number the
    /// design drew" passes or fails on whatever the simulator was last left at
    /// — the same shape of hidden dependency as reading the device timezone.
    /// Passing the category in makes both halves checkable anywhere.
    static func scaledSymbol(_ size: CGFloat, traits: UITraitCollection? = nil) -> CGFloat {
        UIFontMetrics(forTextStyle: metrics(for: style(for: size)))
            .scaledValue(for: size, compatibleWith: traits)
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
        // `relativeTo:` and not `fixedSize:`. The layout is drawn at sizes
        // measured by hand and at the default setting it still is — for the
        // ELEVEN of thirteen sizes that are whole points.
        //
        // Not for the other two. Measured on this SDK: `UIFontMetrics` quantises,
        // and the two paths quantise differently. `scaledValue`, which the symbol
        // helper below uses, snaps to thirds of a point (11.5 → 11.667);
        // `scaledFont`, which is what a scaled FONT goes through, rounds to whole
        // points (11.5 → 12, 14.5 → 15). So the app's four half-point sizes are
        // not byte-for-byte what `fixedSize` gave — this comment used to claim
        // they were, and Gastos Diarios caught the same claim in their own commit.
        // Half a point at 3x is a pixel and a half; it is worth knowing rather
        // than worth fixing, and knowing it is the difference between a design
        // decision and a surprise.
        //
        // The weight is applied to the family rather than baked into the name,
        // which is what a variable font is for.
        return .custom(familyName, size: size, relativeTo: style).weight(weight)
    }
}

extension View {
    /// Outfit typography shorthand: `.appFont(15, .semibold)`.
    ///
    /// A View modifier and not a `Font` value, which is the shape Gastos Diarios
    /// settled on and the one its token emitter and `components.py` assume. The
    /// difference is not cosmetic for them: a modifier is a call site a script can
    /// find and rewrite, whereas `Font.stock(15)` can be assigned to a variable and
    /// applied somewhere else entirely. Adopting it here means the shared emitter
    /// needs no branch per consumer.
    func appFont(_ size: CGFloat, _ weight: Font.Weight = .regular) -> some View {
        font(AppFont.font(size, weight))
    }

    /// An SF Symbol that grows with the text beside it. See `AppFont.scaledSymbol`.
    func appSymbol(_ size: CGFloat, _ weight: Font.Weight = .regular) -> some View {
        font(.stockSymbol(size, weight))
    }
}

extension Font {

    /// An SF Symbol that grows with the text beside it.
    ///
    /// `.system(size:)` does not scale, so every icon in the app stayed the
    /// size it was drawn at while the words around it grew — which is worst for
    /// exactly the person who turned the text up: an icon that is the whole
    /// content of a button becomes a SMALLER target the larger the text gets,
    /// and one sitting beside a label drifts away from it.
    ///
    /// Symbols are system faces, not Outfit, so this scales the point size with
    /// `UIFontMetrics` rather than going through `.custom(relativeTo:)`. Same
    /// anchoring as the text: `AppFont.style(for:)` decides which style it
    /// tracks, so a 13pt icon next to 13pt text grows at the same rate.
    ///
    /// Not for a glyph inside a hard-coded shape — `HueBadge` draws into a
    /// fixed circle, and growing the glyph alone would overflow it.
    static func stockSymbol(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: AppFont.scaledSymbol(size), weight: weight)
    }
}
