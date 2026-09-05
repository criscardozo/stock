import Foundation

// Lives in Data/ and not inside the scanner screen: it is a network client,
// it needs nothing from AVFoundation, and keeping it here is what lets
// StockTests compile the part that decides what an answer MEANS.

/// Open Food Facts: free, no API key, and never load-bearing.
enum OpenFoodFacts {
    struct Product {
        var name: String
        var brand: String?
        var quantity: String?
    }

    /// Three outcomes, not two.
    ///
    /// A single optional collapsed "we asked and they do not have it" into "we
    /// could not ask", and the screen said *"tampoco en Open Food Facts"* for
    /// both — telling someone standing in a shop with no signal that a product
    /// does not exist. The two lead to different actions: one means type it in,
    /// the other means try again outside.
    enum Lookup: Equatable {
        case found(name: String, brand: String?, quantity: String?)
        case unknown
        case unreachable

        var product: Product? {
            guard case let .found(name, brand, quantity) = self else { return nil }
            return Product(name: name, brand: brand, quantity: quantity)
        }
    }

    static func lookup(_ barcode: String) async -> Lookup {
        guard let url = URL(
            string: "https://world.openfoodfacts.org/api/v2/product/\(barcode).json?fields=product_name,brands,quantity"
        ) else { return .unknown }

        var request = URLRequest(url: url)
        // Their guidance: identify yourself, so a misbehaving client can be told
        // apart from everyone else's.
        request.setValue("Stock/0.1 (dev.cardozo.stock)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 6

        // The one failure that is NOT about the product: no network, DNS, TLS,
        // timeout. Anything that answered gets read below.
        guard let (data, _) = try? await URLSession.shared.data(for: request) else {
            return .unreachable
        }
        return classify(data)
    }

    /// The body, once it has arrived. Pure, so it can be tested without a network.
    static func classify(_ data: Data) -> Lookup {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let product = root["product"] as? [String: Any],
              let name = product["product_name"] as? String, !name.isEmpty
        else {
            // They answered and there is nothing usable in it — including the
            // 404 body they send for a barcode nobody has catalogued. That is
            // "unknown", and it is actionable: type the name in.
            return .unknown
        }
        return .found(
            name: name,
            brand: (product["brands"] as? String)?.split(separator: ",").first.map {
                $0.trimmingCharacters(in: .whitespaces)
            },
            quantity: product["quantity"] as? String
        )
    }
}
