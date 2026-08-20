import SwiftUI

/// The pieces the design repeats, in the same measurements as the web's.

/// The tinted circle that carries a category (or a location).
struct HueBadge: View {
    var icon: String
    var hue: String?
    var size: CGFloat = 36

    var body: some View {
        let colours = Theme.hue(hue)
        Circle()
            .fill(colours.bg)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: Theme.symbol(icon))
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(colours.fg)
            )
    }
}

enum ChipTone {
    case danger
    case dangerDeep
    case dangerQuiet
    case primary
    case neutral

    var background: Color {
        switch self {
        case .danger: return Theme.danger
        case .dangerDeep: return Theme.dangerDeep
        case .dangerQuiet: return Theme.dangerSoft
        case .primary: return Theme.primarySoft
        case .neutral: return Theme.neutralSoft
        }
    }

    var foreground: Color {
        switch self {
        case .danger, .dangerDeep: return Theme.onDanger
        case .dangerQuiet: return Theme.dangerDeep
        case .primary: return Theme.primaryDeep
        case .neutral: return Theme.ink2
        }
    }
}

struct Chip: View {
    var icon: String?
    var text: String
    var tone: ChipTone = .neutral

    var body: some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
            }
            Text(text).font(.stock(12, .bold))
        }
        .foregroundStyle(tone.foreground)
        .padding(.horizontal, 11)
        .padding(.vertical, 4)
        .background(Capsule().fill(tone.background))
    }
}

/// The sunken stepper. `remove` greys out at zero — the cheapest possible way to
/// say "this doesn't go lower".
struct Stepper: View {
    var value: Int
    var step: Int
    var label: String
    var onChange: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button {
                onChange(max(0, value - step))
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(value == 0 ? Theme.ink4 : Theme.ink2)
                    .frame(width: 34, height: 30)
            }
            .buttonStyle(.plain)
            .disabled(value == 0)

            Text(label)
                .font(.stock(14, .bold))
                .monospacedDigit()
                .frame(minWidth: 58)

            Button {
                onChange(value + step)
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 34, height: 30)
            }
            .buttonStyle(.plain)
        }
        .padding(3)
        .background(Capsule().fill(Theme.ground))
    }
}

/// Four segments and a word. Never a number — that is the point of levels.
struct LevelDial: View {
    var level: Level
    var showName: Bool = true
    var onChange: ((Level) -> Void)?

    var body: some View {
        HStack(spacing: 9) {
            HStack(spacing: 3) {
                ForEach(1...3 + 1, id: \.self) { step in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(step <= level ? Theme.primary : Theme.track)
                        .frame(width: 14, height: 8)
                        .onTapGesture {
                            // Tapping the segment you're already at means "one
                            // less" — the only way to reach 'vacío' without a
                            // separate control.
                            onChange?(level == step ? step - 1 : step)
                        }
                }
            }
            if showName {
                Text(Levels.name(level))
                    .font(.stock(12, .semibold))
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 40, alignment: .leading)
            }
        }
    }
}

struct SectionLabel: View {
    var text: String

    var body: some View {
        Text(text.uppercased())
            .font(.stock(11, .bold))
            .tracking(0.8)
            .foregroundStyle(Theme.ink3)
            .padding(.leading, 4)
    }
}

/// The white card a grouped list sits in.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .padding(.horizontal, 18)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(Theme.surface)
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))
            )
    }
}

struct PrimaryButton: View {
    var icon: String?
    var title: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon).font(.system(size: 17, weight: .bold)) }
                Text(title).font(.stock(16, .bold))
            }
            .foregroundStyle(Theme.onPrimary)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(Capsule().fill(Theme.primary))
            // 0 8px 20px in CSS terms: SwiftUI's radius is roughly half the blur.
            .shadow(color: Theme.primary.opacity(0.35), radius: 10, y: 8)
        }
        .buttonStyle(.plain)
    }
}

struct Avatar: View {
    var name: String?
    var colour: Color
    var size: CGFloat = 24

    var body: some View {
        Circle()
            .fill(colour)
            .frame(width: size, height: size)
            .overlay(
                Text(String(name?.prefix(1) ?? "?").uppercased())
                    .font(.stock(size * 0.47, .bold))
                    .foregroundStyle(.white)
            )
    }
}

/// The bag with its zigzag top, drawn from the same path the web's AppMark and
/// favicon.svg use — laid out on their 64 grid and scaled to fit.
///
/// It used to be SF Symbols' `bag.fill`, which is a handled shopping bag and
/// not this brand's mark at all: the two apps claimed to match and didn't.
struct BagShape: Shape {
    func path(in rect: CGRect) -> Path {
        // The drawing occupies x 15...49, y 27.5...57 on the 64 grid.
        let s = min(rect.width / 34, rect.height / 29.5)
        let ox = rect.minX + (rect.width - 34 * s) / 2 - 15 * s
        let oy = rect.minY + (rect.height - 29.5 * s) / 2 - 27.5 * s
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + x * s, y: oy + y * s)
        }

        var path = Path()
        path.move(to: p(15, 31.5))
        // The zigzag mouth: eight points alternating between the two heights.
        // Counted in whole steps rather than strided floats — comparing 4.25
        // multiples with == is how a tooth silently flattens.
        for step in 1...8 {
            path.addLine(to: p(15 + 4.25 * CGFloat(step), step.isMultiple(of: 2) ? 31.5 : 27.5))
        }
        path.addLine(to: p(49, 53))
        path.addQuadCurve(to: p(45, 57), control: p(49, 57))
        path.addLine(to: p(19, 57))
        path.addQuadCurve(to: p(15, 53), control: p(15, 57))
        path.closeSubpath()
        return path
    }
}

/// The app mark, matching AppMark on the web — same threshold, same gradient as
/// the installed icon.
///
/// The design's rule is a size, not a preference: "a 32 px y menos se caen los
/// productos — ahí queda la bolsa con su zigzag, que alcanza". Above 32 this
/// draws the full mark, from the same source art the app icons are built from,
/// as a template image; at 32 and under it draws `BagShape` and the produce
/// falls away.
struct AppMark: View {
    var size: CGFloat = 34

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.32)
            .fill(
                LinearGradient(
                    colors: [Theme.markFrom, Theme.markTo],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: size, height: size)
            .overlay(glyph)
    }

    // Theme.markGlyph and not Theme.surface: surface flips to near-black in dark
    // and would turn the bag into a hole. The mark is the icon, and the icon does
    // not repaint itself when the system flips.
    @ViewBuilder private var glyph: some View {
        if size > 32 {
            // The source is laid out on the icon's own canvas, so at the full
            // frame the bag lands exactly where it does on the home screen.
            Image("MarkGlyph")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(Theme.markGlyph)
                .frame(width: size, height: size)
        } else {
            BagShape()
                .fill(Theme.markGlyph)
                .frame(width: size * 0.58, height: size * 0.5)
        }
    }
}
