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
        case .danger, .dangerDeep: return .white
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
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Theme.surface)
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.line))
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
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Capsule().fill(Theme.primary))
            .shadow(color: Theme.primary.opacity(0.3), radius: 10, y: 6)
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

/// The app mark: the reduced bag, matching AppMark on the web.
struct AppMark: View {
    var size: CGFloat = 34

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.32)
            .fill(Theme.primary)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: "bag.fill")
                    .font(.system(size: size * 0.5, weight: .semibold))
                    .foregroundStyle(Theme.surface)
            )
    }
}
