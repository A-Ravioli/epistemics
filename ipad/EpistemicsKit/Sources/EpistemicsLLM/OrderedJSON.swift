import Foundation
import EpistemicsCore

/// A JSON value whose object keys keep their order, with its own serialiser.
///
/// Used for everything this module *writes*: request bodies (byte-stable, so prompt caching sees the same
/// prefix every time), JSON schemas (the model generates fields in schema order), and the fenced input
/// block of the structured roles (pretty-printed like `JSON.stringify(x, null, 2)` on the web).
/// Responses are read with `JSONDecoder` into Decodable types or core's `JSONValue`.
public indirect enum OrderedJSON: Sendable, Hashable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([OrderedJSON])
    case object([(String, OrderedJSON)])

    public static func == (a: OrderedJSON, b: OrderedJSON) -> Bool {
        switch (a, b) {
        case (.null, .null): return true
        case let (.bool(x), .bool(y)): return x == y
        case let (.int(x), .int(y)): return x == y
        case let (.double(x), .double(y)): return x == y
        case let (.string(x), .string(y)): return x == y
        case let (.array(x), .array(y)): return x == y
        case let (.object(x), .object(y)): return x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        default: return false
        }
    }

    public func hash(into h: inout Hasher) {
        switch self {
        case .null: h.combine(0)
        case .bool(let b): h.combine(b)
        case .int(let i): h.combine(i)
        case .double(let d): h.combine(d)
        case .string(let s): h.combine(s)
        case .array(let a): h.combine(a)
        case .object(let o): for (k, v) in o { h.combine(k); h.combine(v) }
        }
    }

    /// Value for `key` in an object, else nil.
    public subscript(key: String) -> OrderedJSON? {
        if case .object(let o) = self { return o.first { $0.0 == key }?.1 }
        return nil
    }

    /// Compact serialisation (no whitespace), keys in insertion order.
    public func serialized() -> String {
        var out = ""
        write(into: &out, indent: nil, level: 0)
        return out
    }

    /// Pretty serialisation with two-space indentation, formatted like `JSON.stringify(value, null, 2)`.
    public func prettySerialized() -> String {
        var out = ""
        write(into: &out, indent: "  ", level: 0)
        return out
    }

    public var data: Data { Data(serialized().utf8) }

    private func write(into out: inout String, indent: String?, level: Int) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .int(let i): out += String(i)
        case .double(let d): out += OrderedJSON.format(d)
        case .string(let s): OrderedJSON.escape(s, into: &out)
        case .array(let a):
            if a.isEmpty { out += "[]"; return }
            out += "["
            for (i, v) in a.enumerated() {
                if i > 0 { out += "," }
                if let indent { out += "\n" + String(repeating: indent, count: level + 1) }
                v.write(into: &out, indent: indent, level: level + 1)
            }
            if let indent { out += "\n" + String(repeating: indent, count: level) }
            out += "]"
        case .object(let o):
            if o.isEmpty { out += "{}"; return }
            out += "{"
            for (i, (k, v)) in o.enumerated() {
                if i > 0 { out += "," }
                if let indent { out += "\n" + String(repeating: indent, count: level + 1) }
                OrderedJSON.escape(k, into: &out)
                out += indent == nil ? ":" : ": "
                v.write(into: &out, indent: indent, level: level + 1)
            }
            if let indent { out += "\n" + String(repeating: indent, count: level) }
            out += "}"
        }
    }

    static func format(_ d: Double) -> String {
        guard d.isFinite else { return "null" } // as JSON.stringify
        if d == d.rounded(), abs(d) < 1e15 { return String(Int(d)) }
        return "\(d)"
    }

    static func escape(_ s: String, into out: inout String) {
        out += "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            default:
                if u.value < 0x20 {
                    out += String(format: "\\u%04x", u.value)
                } else {
                    out.unicodeScalars.append(u)
                }
            }
        }
        out += "\""
    }
}

extension OrderedJSON {
    /// Convert core's (unordered) JSONValue. Object keys are sorted so the result is deterministic.
    public init(_ v: JSONValue) {
        switch v {
        case .null: self = .null
        case .bool(let b): self = .bool(b)
        case .number(let n): self = .double(n)
        case .string(let s): self = .string(s)
        case .array(let a): self = .array(a.map(OrderedJSON.init))
        case .object(let o): self = .object(o.keys.sorted().map { ($0, OrderedJSON(o[$0]!)) })
        }
    }

    /// Convert to core's JSONValue (key order is lost).
    public var jsonValue: JSONValue {
        switch self {
        case .null: return .null
        case .bool(let b): return .bool(b)
        case .int(let i): return .number(Double(i))
        case .double(let d): return .number(d)
        case .string(let s): return .string(s)
        case .array(let a): return .array(a.map(\.jsonValue))
        case .object(let o): return .object(Dictionary(o.map { ($0.0, $0.1.jsonValue) }, uniquingKeysWith: { _, b in b }))
        }
    }
}

extension OrderedJSON {
    /// `.string(s)` when non-nil, else nil (for building objects with optional members).
    static func opt(_ s: String?) -> OrderedJSON? { s.map(OrderedJSON.string) }

    /// Object from pairs, dropping nil values (like `...(x ? {k: x} : {})` on the web).
    static func obj(_ pairs: [(String, OrderedJSON?)]) -> OrderedJSON {
        .object(pairs.compactMap { k, v in v.map { (k, $0) } })
    }
}
