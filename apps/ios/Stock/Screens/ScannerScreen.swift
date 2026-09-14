import AVFoundation
import SwiftUI
import VisionKit

/// Scan a barcode, find the item, adjust it without typing.
///
/// The lookup order matters: the household's OWN catalogue first, so the second
/// time you scan the milk it is your item, with your name and your minimum.
/// Open Food Facts is a convenience for what's left — every flow here works with
/// it unreachable.
struct ScannerScreen: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var barcode: String?
    @State private var known: Item?
    @State private var lookedUp: OpenFoodFacts.Lookup?
    @State private var searching = false
    @State private var creating = false
    @State private var permission = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        NavigationStack {
            ZStack {
                if permission == .denied || permission == .restricted {
                    deniedState
                } else if DataScannerViewController.isSupported
                    && DataScannerViewController.isAvailable {
                    BarcodeScanner { code in handle(code) }
                        .ignoresSafeArea()
                } else {
                    // The Simulator has no camera, and neither do older devices.
                    EmptyStateView(
                        icon: "camera.metering.unknown",
                        title: "Sin cámara",
                        message: "Este dispositivo no puede escanear. Se puede cargar a mano igual."
                    )
                }

                if let barcode { result(for: barcode) }
            }
            .background(Theme.ground)
            .navigationTitle("Escanear código")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { dismiss() } }
            }
            .sheet(isPresented: $creating) {
                ItemSheet(
                    item: nil,
                    prefill: barcode.map {
                        (
                            name: lookedUp?.product?.name ?? "",
                            brand: lookedUp?.product?.brand,
                            barcode: $0
                        )
                    }
                )
            }
        }
    }

    private var deniedState: some View {
        VStack(spacing: 14) {
            EmptyStateView(
                icon: "camera.fill",
                title: "Sin permiso de cámara",
                message: "El escáner necesita la cámara. Se puede cargar a mano igual."
            )
            Button("Abrir Ajustes") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .appFont(15, .bold)
            .foregroundStyle(Theme.primaryDeep)
        }
    }

    @ViewBuilder private func result(for code: String) -> some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                if let known {
                    HStack(spacing: 12) {
                        HueBadge(
                            icon: store.household?.categories[known.categoryId]?.icon ?? "inventory_2",
                            hue: store.household?.categories[known.categoryId]?.hue
                        )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(known.name).appFont(17, .bold)
                            Text("\(code) · ya está en tu catálogo")
                                .appFont(12)
                                .foregroundStyle(Theme.ink2)
                        }
                    }

                    HStack {
                        Text("Ahora hay").appFont(13, .semibold).foregroundStyle(Theme.ink2)
                        Spacer()
                        if known.tracking == .quantity {
                            Stepper(
                                value: known.quantity ?? 0,
                                step: (known.unit ?? .unit).step,
                                label: Quantities.format(known.quantity ?? 0, known.unit ?? .unit),
                                name: known.name
                            ) { adjust(known, quantity: $0) }
                        } else {
                            LevelDial(level: known.level ?? 0, name: known.name) { adjust(known, level: $0) }
                        }
                    }

                    PrimaryButton(icon: "plus", title: "Sumar 1 y seguir") {
                        adjust(known, quantity: (known.quantity ?? 0) + 1)
                        barcode = nil
                    }
                } else if searching {
                    ProgressView("Buscando…").appFont(14)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(lookedUp?.product?.name ?? "No está en el catálogo")
                            .appFont(17, .bold)
                        // Says which of the two happened. "Tampoco en Open Food
                        // Facts" was shown even when the phone never reached
                        // them, which is the opposite of what to do next.
                        Text(subtitle(for: code))
                            .appFont(12)
                            .foregroundStyle(Theme.ink2)
                    }
                    PrimaryButton(icon: "plus", title: "Crear ítem") { creating = true }
                }

                Button("Escanear otro") { reset() }
                    .appFont(14, .semibold)
                    .foregroundStyle(Theme.ink2)
                    .frame(maxWidth: .infinity)
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 24).fill(Theme.surface)
                    .shadow(color: Theme.ink.opacity(0.14), radius: 24, y: 12)
            )
            .padding(16)
        }
    }

    private func handle(_ code: String) {
        guard barcode != code else { return }
        barcode = code
        known = store.items.first { $0.barcodes.contains(code) }
        lookedUp = nil

        guard known == nil else { return }
        searching = true
        Task {
            lookedUp = await OpenFoodFacts.lookup(code)
            searching = false
        }
    }

    private func subtitle(for code: String) -> String {
        switch lookedUp {
        case .found: "\(code) · encontrado en Open Food Facts"
        case .unknown: "\(code) · tampoco en Open Food Facts"
        case .unreachable: "\(code) · sin conexión, no se pudo consultar"
        case nil: code
        }
    }

    private func reset() {
        barcode = nil
        known = nil
        lookedUp = nil
    }

    private func adjust(_ item: Item, quantity: Int? = nil, level: Level? = nil) {
        guard let householdId = store.householdId, let uid = session.user?.uid else { return }
        Mutations.adjustStock(
            householdId: householdId, uid: uid, item: item, quantity: quantity, level: level)
        known = store.items.first { $0.id == item.id }
    }
}

/// VisionKit's scanner, wrapped so SwiftUI can hold it.
struct BarcodeScanner: UIViewControllerRepresentable {
    var onScan: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce])],
            qualityLevel: .balanced,
            isHighFrameRateTrackingEnabled: false,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        try? controller.startScanning()
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void

        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }

        func dataScanner(
            _ scanner: DataScannerViewController, didAdd items: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            for item in items {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    onScan(value)
                    return
                }
            }
        }
    }
}
