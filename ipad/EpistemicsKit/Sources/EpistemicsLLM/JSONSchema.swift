import Foundation

/// A JSON schema for structured output (`output_config.format`), built so it is always valid for the API:
/// every object lists all its properties as `required` and sets `"additionalProperties": false`, and there are
/// no numeric/length constraints (clamp and validate client-side instead). Property order is kept, and the
/// model generates fields in that order.
public struct JSONSchema: Sendable, Hashable {
    public let json: OrderedJSON

    public init(raw json: OrderedJSON) { self.json = json }

    public static let string = JSONSchema(raw: .object([("type", .string("string"))]))
    public static let number = JSONSchema(raw: .object([("type", .string("number"))]))
    public static let integer = JSONSchema(raw: .object([("type", .string("integer"))]))
    public static let boolean = JSONSchema(raw: .object([("type", .string("boolean"))]))

    /// A string restricted to `values`.
    public static func enumeration(_ values: [String]) -> JSONSchema {
        JSONSchema(raw: .object([("type", .string("string")), ("enum", .array(values.map(OrderedJSON.string)))]))
    }

    public static func array(_ items: JSONSchema) -> JSONSchema {
        JSONSchema(raw: .object([("type", .string("array")), ("items", items.json)]))
    }

    /// An object with exactly these properties, all required, in this order.
    public static func object(_ properties: KeyValuePairs<String, JSONSchema>) -> JSONSchema {
        JSONSchema(raw: .object([
            ("type", .string("object")),
            ("properties", .object(properties.map { ($0.key, $0.value.json) })),
            ("required", .array(properties.map { .string($0.key) })),
            ("additionalProperties", .bool(false)),
        ]))
    }

    /// The value or `null`.
    public static func nullable(_ inner: JSONSchema) -> JSONSchema {
        JSONSchema(raw: .object([("anyOf", .array([inner.json, .object([("type", .string("null"))])]))]))
    }

    /// The same schema with a `description` (a hint to the model, not a constraint).
    public func described(_ text: String) -> JSONSchema {
        guard case .object(var pairs) = json else { return self }
        pairs.removeAll { $0.0 == "description" }
        pairs.append(("description", .string(text)))
        return JSONSchema(raw: .object(pairs))
    }
}
