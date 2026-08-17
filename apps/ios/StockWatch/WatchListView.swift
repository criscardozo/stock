import SwiftUI

/// The list, on the wrist. This is the whole reason the watch app exists: at the
/// supermarket both hands are busy, and pulling the phone out to tick one box is
/// the friction that makes people stop ticking at all.
struct WatchListView: View {
    @Environment(WatchLink.self) private var link

    var body: some View {
        List {
            if !link.pending.isEmpty {
                Section {
                    ForEach(link.pending) { entry in
                        WatchRow(entry: entry) { link.toggle(entry) }
                    }
                } header: {
                    Text("Falta \(link.pending.count)")
                        .foregroundStyle(WatchTheme.ink3)
                }
            }

            if !link.done.isEmpty {
                Section {
                    ForEach(link.done) { entry in
                        WatchRow(entry: entry) { link.toggle(entry) }
                    }
                } header: {
                    Text("En el changuito")
                        .foregroundStyle(WatchTheme.ink3)
                }
            }

            if link.entries.isEmpty {
                WatchEmpty(
                    icon: link.everReceived ? "checkmark.circle.fill" : "iphone.slash",
                    title: link.everReceived ? "Nada que comprar" : "Sin datos",
                    message: link.everReceived
                        ? "La lista está vacía."
                        : "Abrí Stock en el teléfono para que mande la lista."
                )
            }
        }
        .listStyle(.carousel)
        .containerBackground(WatchTheme.ground.gradient, for: .navigation)
        .navigationTitle("Falta")
    }
}

struct WatchRow: View {
    var entry: WatchEntry
    var onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(entry.checked ? WatchTheme.primary : .clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(entry.checked ? .clear : WatchTheme.ink3, lineWidth: 2)
                        )
                        .frame(width: 22, height: 22)
                    if entry.checked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(WatchTheme.onPrimary)
                    }
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.label)
                        .font(.system(size: 15, weight: .semibold))
                        .strikethrough(entry.checked)
                        .foregroundStyle(entry.checked ? WatchTheme.ink2 : WatchTheme.ink)
                    if let detail = entry.detail {
                        Text(detail)
                            .font(.system(size: 12))
                            .foregroundStyle(WatchTheme.ink3)
                    }
                }
                .multilineTextAlignment(.leading)

                Spacer(minLength: 0)
            }
            .padding(.vertical, 3)
        }
        .buttonStyle(.plain)
        .listItemTint(WatchTheme.surface)
    }
}

struct WatchEmpty: View {
    var icon: String
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(WatchTheme.primary)
            Text(title).font(.system(size: 15, weight: .bold))
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(WatchTheme.ink3)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .listRowBackground(Color.clear)
    }
}
