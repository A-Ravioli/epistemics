import Foundation

// JavaScript number semantics the TypeScript core relies on. The scheduler must agree with the web
// bit for bit (fuzz seeds are strings built from numbers, intervals come from Math.round), so these are
// exact re-implementations, not approximations. Each is checked against Node in the conformance fixtures.

/// `Math.round`: nearest integer, ties toward +∞. (`floor(x + 0.5)` is wrong for 0.49999999999999994.)
@inline(__always)
public func jsRound(_ x: Double) -> Double {
    guard x.isFinite else { return x }
    let f = x.rounded(.down)
    return x - f >= 0.5 ? f + 1 : f
}

/// ts-fsrs `roundTo(num, decimals)`: `Math.round(num * 10 ** d) / 10 ** d`.
@inline(__always)
public func roundTo(_ x: Double, _ decimals: Int) -> Double {
    let factor = pow(10.0, Double(decimals))
    return jsRound(x * factor) / factor
}

/// `Math.max` / `Math.min`: NaN in, NaN out (Swift's `max` is not symmetric in NaN).
@inline(__always) func jsMax(_ a: Double, _ b: Double) -> Double { (a.isNaN || b.isNaN) ? .nan : (a > b ? a : b) }
@inline(__always) func jsMin(_ a: Double, _ b: Double) -> Double { (a.isNaN || b.isNaN) ? .nan : (a < b ? a : b) }
/// ts-fsrs `clamp`: `Math.min(Math.max(value, min), max)`.
@inline(__always) func jsClamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { jsMin(jsMax(v, lo), hi) }

/// `x >>> 0`.
@inline(__always)
func jsToUint32(_ x: Double) -> UInt32 {
    guard x.isFinite else { return 0 }
    let m = x.rounded(.towardZero).truncatingRemainder(dividingBy: 4_294_967_296.0)
    return UInt32(m < 0 ? m + 4_294_967_296.0 : m)
}

/// `x | 0`.
@inline(__always)
func jsToInt32(_ x: Double) -> Int32 { Int32(bitPattern: jsToUint32(x)) }

/// JS truthiness for numbers used with `||` (0 and NaN are falsy).
@inline(__always) func jsTruthy(_ x: Double) -> Bool { !(x == 0 || x.isNaN) }

/// `Number.prototype.toString()` (radix 10): shortest round-trip digits, laid out per ECMA-262 Number::toString.
public func jsNumberString(_ x: Double) -> String {
    if x.isNaN { return "NaN" }
    if x == 0 { return "0" }
    if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
    if x < 0 { return "-" + jsNumberString(-x) }
    // Swift's description is also shortest-round-trip (closest on ties); only the layout differs.
    let desc = x.description
    var mantissa = Substring(desc)
    var exp = 0
    if let e = desc.firstIndex(where: { $0 == "e" || $0 == "E" }) {
        mantissa = desc[..<e]
        exp = Int(desc[desc.index(after: e)...])!
    }
    let parts = mantissa.split(separator: ".", omittingEmptySubsequences: false)
    let intPart = parts[0]
    let fracPart = parts.count > 1 ? parts[1] : ""
    var digits = Array(intPart + fracPart)
    var n = intPart.count + exp
    while let f = digits.first, f == "0" { digits.removeFirst(); n -= 1 }
    while let l = digits.last, l == "0" { digits.removeLast() }
    let k = digits.count
    let s = String(digits)
    if k <= n && n <= 21 { return s + String(repeating: "0", count: n - k) }
    if 0 < n && n <= 21 { return String(digits[0..<n]) + "." + String(digits[n...]) }
    if -6 < n && n <= 0 { return "0." + String(repeating: "0", count: -n) + s }
    let e = n - 1
    let sign = e < 0 ? "-" : "+"
    let head = k == 1 ? s : String(digits[0]) + "." + String(digits[1...])
    return head + "e" + sign + String(abs(e))
}

/// `Number.prototype.toFixed(digits)` for 0 ≤ digits ≤ 20: exact decimal value, ties away from zero.
public func jsToFixed(_ x: Double, _ digits: Int) -> String {
    if x.isNaN { return "NaN" }
    if !(abs(x) < 1e21) { return jsNumberString(x) }
    if x < 0 { return "-" + jsToFixed(-x, digits) }
    // printf rounds the exact binary value correctly, half-to-even; toFixed rounds half up. They can only
    // disagree on an exact tie, which needs x × 10^digits to end in exactly .5.
    let quick = String(format: "%.\(digits)f", x)
    let scaled = x * pow(10.0, Double(digits))
    if abs(scaled - scaled.rounded(.down) - 0.5) > 1e-6 { return quick }
    let exact = String(format: "%.\(digits + 1100)f", x)
    guard let dot = exact.firstIndex(of: ".") else { return quick }
    let tail = exact[exact.index(after: dot)...]
    let cut = tail.index(tail.startIndex, offsetBy: digits)
    let rest = tail[cut...]
    guard rest.first == "5", rest.dropFirst().allSatisfy({ $0 == "0" }) else { return quick }
    // A true tie: round the truncated value up by one unit in the last place.
    var chars = Array(exact[..<dot] + (digits > 0 ? "." + tail[..<cut] : ""))
    var i = chars.count - 1
    while i >= 0 {
        if chars[i] == "." { i -= 1; continue }
        if chars[i] == "9" { chars[i] = "0"; i -= 1; continue }
        chars[i] = Character(String(chars[i].wholeNumberValue! + 1))
        return String(chars)
    }
    return "1" + String(chars)
}

/// `+x.toFixed(digits)`.
@inline(__always)
func jsToFixedNumber(_ x: Double, _ digits: Int) -> Double {
    Double(jsToFixed(x, digits)) ?? .nan
}

// MARK: - Strings

/// Characters matched by JS `\s` and stripped by `String.prototype.trim`.
@inline(__always)
func jsIsWhitespace(_ u: Unicode.Scalar) -> Bool {
    switch u.value {
    case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
        return true
    default:
        return false
    }
}

/// `s.trim()`.
func jsTrim(_ s: String) -> String {
    let scalars = s.unicodeScalars
    guard let first = scalars.firstIndex(where: { !jsIsWhitespace($0) }) else { return "" }
    let last = scalars.lastIndex(where: { !jsIsWhitespace($0) })!
    return String(scalars[first...last])
}

/// `s.replace(/\s+/g, ' ').trim()`.
func jsOneLine(_ s: String) -> String {
    var out = String.UnicodeScalarView()
    var inSpace = false
    for u in s.unicodeScalars {
        if jsIsWhitespace(u) {
            if !inSpace { out.append(" "); inSpace = true }
        } else {
            out.append(u)
            inSpace = false
        }
    }
    return jsTrim(String(out))
}

/// `s.length` (UTF-16 code units).
@inline(__always) func jsLength(_ s: String) -> Int { s.utf16.count }

/// `s.slice(0, n)` in UTF-16 code units.
func jsSlice(_ s: String, _ n: Int) -> String {
    let units = Array(s.utf16.prefix(max(0, n)))
    return String(decoding: units, as: UTF16.self)
}

/// `haystack.includes(needle)` on UTF-16 code units (not grapheme clusters).
func jsIncludes(_ haystack: String, _ needle: String) -> Bool {
    let h = Array(haystack.utf16), n = Array(needle.utf16)
    if n.isEmpty { return true }
    if n.count > h.count { return false }
    outer: for i in 0...(h.count - n.count) {
        for j in 0..<n.count where h[i + j] != n[j] { continue outer }
        return true
    }
    return false
}

/// `a < b ? -1 : a > b ? 1 : 0` on UTF-16 code units, the default `Array.prototype.sort` string order.
func jsCompareCodeUnits(_ a: String, _ b: String) -> Int {
    var ia = a.utf16.makeIterator(), ib = b.utf16.makeIterator()
    while true {
        switch (ia.next(), ib.next()) {
        case (nil, nil): return 0
        case (nil, _): return -1
        case (_, nil): return 1
        case let (x?, y?): if x != y { return x < y ? -1 : 1 }
        }
    }
}

/// `a.localeCompare(b)` for the identifiers the core compares (UUIDs and slugs). V8 uses the ICU root
/// collation; for ASCII it orders punctuation < digits < letters and compares case only as a tie-break.
/// Checked against Node in the conformance fixtures.
func jsLocaleCompare(_ a: String, _ b: String) -> Int {
    if a == b { return 0 }
    switch a.compare(b, options: [], range: nil, locale: Locale(identifier: "en_US_POSIX")) {
    case .orderedAscending: return -1
    case .orderedDescending: return 1
    case .orderedSame: return jsCompareCodeUnits(a, b)
    }
}

// MARK: - Insertion-ordered map (JS `Map`)

/// The subset of JS `Map` semantics the core uses: iteration in first-insertion order, updates keep position.
struct JSMap<Key: Hashable, Value> {
    private(set) var keys: [Key] = []
    private var storage: [Key: Value] = [:]
    subscript(key: Key) -> Value? {
        get { storage[key] }
        set {
            if let newValue {
                if storage.updateValue(newValue, forKey: key) == nil { keys.append(key) }
            } else if storage.removeValue(forKey: key) != nil {
                keys.removeAll { $0 == key }
            }
        }
    }
    var values: [Value] { keys.map { storage[$0]! } }
    var entries: [(Key, Value)] { keys.map { ($0, storage[$0]!) } }
    var count: Int { keys.count }
}
