import Foundation

/// Small text utilities shared by the leak detector, the turn-shape checker, the grader's exact match and the
/// mock provider (port of text.ts). The regexes match the JavaScript ones exactly, including JS's ASCII-only
/// `\d` and `\w`; lengths are counted in UTF-16 units as in JS.
public enum TextUtil {
    static let stopwords: Set<String> = [
        "a", "an", "the", "and", "or", "but", "if", "then", "so", "of", "to", "in", "on", "at", "by", "for", "with", "as", "from",
        "into", "over", "under", "than", "that", "this", "these", "those", "it", "its", "is", "are", "was", "were", "be", "been",
        "being", "am", "do", "does", "did", "has", "have", "had", "not", "no", "yes", "can", "could", "would", "should", "will",
        "shall", "may", "might", "must", "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them", "my", "your",
        "his", "our", "their", "what", "which", "who", "whom", "when", "where", "why", "how", "all", "any", "each", "some",
        "more", "most", "such", "only", "own", "very", "just", "also", "there", "here", "because", "about",
        "up", "down", "out", "off", "again", "between", "through", "while", "after", "before", "per",
    ]

    private static func re(_ pattern: String) -> NSRegularExpression {
        // Patterns are literals; a failure is a programming error.
        try! NSRegularExpression(pattern: pattern, options: [])
    }

    /// JS `\s` (ICU's `\s` differs slightly: no \v, no U+FEFF).
    static let ws = "\\t\\n\\u000b\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"

    nonisolated(unsafe) private static let combining = re("[\\u0300-\\u036f]")
    nonisolated(unsafe) private static let nonWord = re("[^\\p{L}\\p{N}\(ws).-]")
    nonisolated(unsafe) private static let sentencePeriod = re("(?<![0-9])\\.|\\.(?![0-9])")
    nonisolated(unsafe) private static let dash = re("(?<![A-Za-z0-9_])-|-(?![A-Za-z0-9_])")
    nonisolated(unsafe) private static let spaces = re("[\(ws)]+")
    nonisolated(unsafe) private static let fencedCode = re("```[\\s\\S]*?```")
    nonisolated(unsafe) private static let inlineCode = re("`[^`\\n]*`")
    nonisolated(unsafe) private static let deltaToken = re("[^\(ws)]+[\(ws)]*|[\(ws)]+")
    nonisolated(unsafe) private static let questionRun = re("\\?+")
    nonisolated(unsafe) private static let stemExempt = re("(ss|us|is)$")

    static func replace(_ r: NSRegularExpression, in s: String, with t: String) -> String {
        r.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: NSRegularExpression.escapedTemplate(for: t))
    }

    static func matches(_ r: NSRegularExpression, in s: String) -> [String] {
        r.matches(in: s, range: NSRange(s.startIndex..., in: s)).compactMap { Range($0.range, in: s).map { String(s[$0]) } }
    }

    /// JS `String.prototype.trim` whitespace (ECMAScript WhiteSpace + LineTerminator).
    static func isJSWhitespace(_ u: Unicode.Scalar) -> Bool {
        switch u.value {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        case 0x2000...0x200A: return true
        default: return false
        }
    }

    static func jsTrim(_ s: String) -> String {
        let scalars = s.unicodeScalars
        guard let first = scalars.firstIndex(where: { !isJSWhitespace($0) }),
              let last = scalars.lastIndex(where: { !isJSWhitespace($0) }) else { return "" }
        return String(scalars[first...last])
    }

    /// Lowercase, strip diacritics and punctuation, collapse whitespace. Keeps decimal points and hyphenated words.
    public static func normalise(_ text: String) -> String {
        var s = text.decomposedStringWithCompatibilityMapping // NFKD
        s = replace(combining, in: s, with: "")
        s = s.lowercased()
        s = replace(nonWord, in: s, with: " ")
        s = replace(sentencePeriod, in: s, with: " ")   // keep decimal points, drop sentence periods
        s = replace(dash, in: s, with: " ")             // keep hyphenated words, drop dashes
        s = replace(spaces, in: s, with: " ")
        return jsTrim(s)
    }

    public static func words(_ text: String) -> [String] {
        let n = normalise(text)
        return n.isEmpty ? [] : n.components(separatedBy: " ")
    }

    /// Very light stemming so "events"/"event" compare equal.
    public static func stem(_ w: String) -> String {
        if w.utf16.count > 3, w.hasSuffix("s"), matches(stemExempt, in: w).isEmpty { return String(w.dropLast()) }
        return w
    }

    public static func contentWords(_ text: String) -> [String] {
        words(text).filter { !stopwords.contains($0) && $0.utf16.count > 1 }.map(stem)
    }

    public static func isStopword(_ w: String) -> Bool { stopwords.contains(w) }

    /// Remove fenced and inline code, so question marks inside code are not counted as questions.
    public static func stripCode(_ text: String) -> String {
        replace(inlineCode, in: replace(fencedCode, in: text, with: " "), with: " ")
    }

    /// Whitespace-separated tokens outside code.
    public static func wordCount(_ text: String) -> Int {
        let t = jsTrim(stripCode(text))
        return t.isEmpty ? 0 : matches(spaces, in: t).count + 1
    }

    /// Split text into deltas that rejoin to the original, whitespace included.
    public static func splitDeltas(_ text: String) -> [String] {
        matches(deltaToken, in: text)
    }

    /// Number of shared distinct content words.
    public static func sharedContentWords(_ a: String, _ b: String) -> Int {
        let bs = Set(contentWords(b))
        return Set(contentWords(a)).filter { bs.contains($0) }.count
    }

    /// Runs of question marks outside code ("??" counts once).
    public static func questionCount(_ text: String) -> Int {
        matches(questionRun, in: stripCode(text)).count
    }

    /// JS `Number(s)` for the decimal/hex/exponent forms a normalised token can hold; nil where JS gives NaN.
    static func jsNumber(_ s: String) -> Double? {
        let t = jsTrim(s)
        if t.isEmpty { return 0 }
        if t.lowercased().contains("inf") || t.lowercased().contains("nan") { return nil }
        return Double(t)
    }

    /// JS `s.slice(0, n)`: the first `n` UTF-16 units.
    static func jsSlice(_ s: String, _ n: Int) -> String {
        String(decoding: Array(s.utf16.prefix(n)), as: UTF16.self)
    }

    /// Ordered de-duplication (like `[...new Set(xs)]`).
    static func unique<S: Sequence>(_ xs: S) -> [S.Element] where S.Element: Hashable {
        var seen = Set<S.Element>()
        return xs.filter { seen.insert($0).inserted }
    }
}
