import CryptoKit
import Foundation

// ids.ts: UUIDv7 ids, stable content ids, SHA-256 and canonical JSON for content hashes.

/// UUIDv7 (time-ordered). `now` is epoch ms; the remaining 74 bits are random.
public func uuidv7(_ now: EpochMs = Int(Date().timeIntervalSince1970 * 1000)) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let ts = UInt64(truncatingIfNeeded: now)
    for i in 0..<6 { bytes[i] = UInt8(truncatingIfNeeded: ts >> (8 * UInt64(5 - i))) }
    var rng = SystemRandomNumberGenerator()
    for i in 6..<16 { bytes[i] = UInt8.random(in: 0...255, using: &rng) }
    bytes[6] = (bytes[6] & 0x0F) | 0x70
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    return formatUuid(hex(bytes))
}

private func hex<S: Sequence>(_ bytes: S) -> String where S.Element == UInt8 {
    bytes.map { String(format: "%02x", $0) }.joined()
}

private func formatUuid(_ h: String) -> String {
    let c = Array(h)
    return "\(String(c[0..<8]))-\(String(c[8..<12]))-\(String(c[12..<16]))-\(String(c[16..<20]))-\(String(c[20..<32]))"
}

/// Stable, deterministic id for content authored by hand or by generators: namespace + key.
public func stableId(_ namespace: String, _ key: String) -> String {
    let c = Array(sha256("\(namespace):\(key)"))
    return "\(String(c[0..<8]))-\(String(c[8..<12]))-5\(String(c[13..<16]))-8\(String(c[17..<20]))-\(String(c[20..<32]))"
}

/// Lowercase hex SHA-256 of the UTF-8 bytes of `text`.
public func sha256(_ text: String) -> String {
    hex(SHA256.hash(data: Data(text.utf8)))
}

/// Canonical JSON: sorted keys, no whitespace, `JSON.stringify` number and string formatting.
public func canonicalJson(_ value: JSONValue) -> String {
    var out = ""
    writeCanonical(value, into: &out)
    return out
}

/// Canonical JSON of any Encodable value (encoded, then re-serialised as `canonicalJson` would on the web).
public func canonicalJson<T: Encodable>(_ value: T) throws -> String {
    let data = try JSONEncoder().encode(value)
    return canonicalJson(try JSONDecoder().decode(JSONValue.self, from: data))
}

private func writeCanonical(_ v: JSONValue, into out: inout String) {
    switch v {
    case .null: out += "null"
    case .bool(let b): out += b ? "true" : "false"
    case .number(let n): out += n.isFinite ? jsNumberString(n) : "null"
    case .string(let s): writeJsonString(s, into: &out)
    case .array(let a):
        out += "["
        for (i, x) in a.enumerated() {
            if i > 0 { out += "," }
            writeCanonical(x, into: &out)
        }
        out += "]"
    case .object(let o):
        out += "{"
        for (i, k) in jsObjectKeyOrder(o.keys.sorted { jsCompareCodeUnits($0, $1) < 0 }).enumerated() {
            if i > 0 { out += "," }
            writeJsonString(k, into: &out)
            out += ":"
            writeCanonical(o[k]!, into: &out)
        }
        out += "}"
    }
}

/// JS objects enumerate array-index keys ("0", "7", "12") first, ascending numerically, then the rest
/// in insertion order. `Object.fromEntries(sorted)` therefore reorders integer-like keys.
private func jsObjectKeyOrder(_ sorted: [String]) -> [String] {
    func arrayIndex(_ k: String) -> UInt32? {
        guard let n = UInt32(k), n != UInt32.max, String(n) == k else { return nil }
        return n
    }
    let indices = sorted.compactMap { k in arrayIndex(k).map { (k, $0) } }.sorted { $0.1 < $1.1 }.map(\.0)
    return indices + sorted.filter { arrayIndex($0) == nil }
}

private func writeJsonString(_ s: String, into out: inout String) {
    out += "\""
    for u in s.unicodeScalars {
        switch u {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\u{08}": out += "\\b"
        case "\u{0C}": out += "\\f"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if u.value < 0x20 { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
        }
    }
    out += "\""
}
