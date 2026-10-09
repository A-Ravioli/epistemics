import SwiftUI

/// Renders the material's Markdown with inline `$…$` / `$$…$$` LaTeX as typeset-looking Unicode.
///
/// The packs use a small, school-level subset (×, fractions, binomials, ∩/∪, P(A | B), √, σ, μ, x̄),
/// which Unicode covers well; anything unknown is shown as its source rather than dropped.
enum MathText {
    static func attributed(_ markdown: String) -> AttributedString {
        let converted = convertMath(in: markdown)
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: converted, options: options)) ?? AttributedString(converted)
    }

    /// Replaces every `$…$` / `$$…$$` span with its Unicode rendering.
    static func convertMath(in text: String) -> String {
        var out = ""
        var rest = Substring(text)
        while let start = rest.firstIndex(of: "$") {
            out += rest[..<start]
            let display = rest[start...].hasPrefix("$$")
            let open = rest.index(start, offsetBy: display ? 2 : 1)
            let closeToken = display ? "$$" : "$"
            guard let close = rest[open...].range(of: closeToken) else {
                out += rest[start...]
                return out
            }
            let tex = String(rest[open..<close.lowerBound])
            // Escape Markdown-significant characters produced from maths so they stay literal.
            out += latexToUnicode(tex).replacingOccurrences(of: "*", with: "\\*").replacingOccurrences(of: "_", with: "\\_")
            rest = rest[close.upperBound...]
        }
        out += rest
        return out
    }

    private static let symbols: [String: String] = [
        "times": "×", "cdot": "·", "cdots": "⋯", "dots": "…", "ldots": "…", "approx": "≈", "mid": "|",
        "cap": "∩", "cup": "∪", "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "ne": "≠", "neq": "≠", "pm": "±",
        "emptyset": "∅", "varnothing": "∅", "Rightarrow": "⇒", "rightarrow": "→", "to": "→", "subseteq": "⊆", "subset": "⊂",
        "in": "∈", "notin": "∉", "sim": "~", "infty": "∞", "sum": "Σ", "prod": "Π", "max": "max", "min": "min",
        "Pr": "Pr", "log": "log", "ln": "ln", "exp": "exp", "lfloor": "⌊", "rfloor": "⌋", "lceil": "⌈", "rceil": "⌉",
        "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "theta": "θ", "lambda": "λ", "mu": "μ",
        "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "φ", "chi": "χ", "omega": "ω", "Omega": "Ω", "Sigma": "Σ",
        "Delta": "Δ", "Phi": "Φ", "Pi": "Π", "lvert": "|", "rvert": "|", "vert": "|", "neg": "¬", "land": "∧", "lor": "∨",
        "quad": "  ", "qquad": "    ", "{": "{", "}": "}", "%": "%", "$": "$", "&": "&", "#": "#",
        ",": "\u{2009}", ";": " ", ":": " ", "!": "", " ": " ", "left": "", "right": "", "displaystyle": "",
        "complement": "ᶜ", "prime": "′", "circ": "∘", "equiv": "≡", "propto": "∝", "forall": "∀", "exists": "∃",
    ]

    private static let superscripts: [Character: Character] = [
        "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
        "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ", "c": "ᶜ", "k": "ᵏ", "x": "ˣ",
        "r": "ʳ", "t": "ᵗ", "m": "ᵐ",
    ]
    private static let subscripts: [Character: Character] = [
        "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
        "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "n": "ₙ", "r": "ᵣ", "x": "ₓ",
        "a": "ₐ", "e": "ₑ", "o": "ₒ", "m": "ₘ", "t": "ₜ",
    ]

    /// A small recursive-descent converter over the LaTeX subset the packs use.
    static func latexToUnicode(_ tex: String) -> String {
        var p = Parser(chars: Array(tex))
        return p.parseSequence(until: nil).replacingOccurrences(of: "  ", with: " ")
    }

    private struct Parser {
        let chars: [Character]
        var i = 0

        mutating func parseSequence(until terminator: Character?) -> String {
            var out = ""
            while i < chars.count {
                let c = chars[i]
                if let terminator, c == terminator { i += 1; return out }
                switch c {
                case "\\": out += parseCommand()
                case "{": i += 1; out += parseSequence(until: "}")
                case "^": i += 1; out += script(parseArgument(), table: MathText.superscripts, fallbackPrefix: "^")
                case "_": i += 1; out += script(parseArgument(), table: MathText.subscripts, fallbackPrefix: "_")
                case "~": i += 1; out += " "
                case "-": i += 1; out += "−"
                case "'": i += 1; out += "′"
                default: i += 1; out.append(c)
                }
            }
            return out
        }

        mutating func parseArgument() -> String {
            skipSpaces()
            guard i < chars.count else { return "" }
            if chars[i] == "{" { i += 1; return parseSequence(until: "}") }
            if chars[i] == "\\" { return parseCommand() }
            let c = chars[i]; i += 1
            return c == "-" ? "−" : String(c)
        }

        mutating func skipSpaces() { while i < chars.count, chars[i] == " " { i += 1 } }

        mutating func parseCommand() -> String {
            i += 1 // backslash
            guard i < chars.count else { return "" }
            var name = ""
            if chars[i].isLetter {
                while i < chars.count, chars[i].isLetter { name.append(chars[i]); i += 1 }
            } else {
                name = String(chars[i]); i += 1
            }
            switch name {
            case "frac", "tfrac", "dfrac":
                let a = parseArgument(), b = parseArgument()
                return "\(wrap(a))⁄\(wrap(b))".replacingOccurrences(of: "⁄", with: "/")
            case "binom", "tbinom", "dbinom":
                let n = parseArgument(), k = parseArgument()
                return "C(\(n), \(k))"
            case "sqrt":
                let a = parseArgument()
                return a.count == 1 ? "√\(a)" : "√(\(a))"
            case "text", "mathrm", "textrm", "mathit", "textit", "mathbf", "textbf", "operatorname", "mathsf":
                return parseArgument()
            case "mathbb":
                let a = parseArgument()
                return ["P": "ℙ", "E": "𝔼", "R": "ℝ", "N": "ℕ", "Z": "ℤ"][a] ?? a
            case "bar", "overline":
                let a = parseArgument()
                return a.count == 1 ? a + "\u{0305}" : "(\(a))\u{0305}"
            case "hat", "widehat":
                let a = parseArgument()
                return a.count == 1 ? a + "\u{0302}" : "(\(a))\u{0302}"
            case "tilde":
                return parseArgument() + "\u{0303}"
            case "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr":
                return ""
            default:
                if let s = MathText.symbols[name] { return s }
                return "\\" + name
            }
        }

        func wrap(_ s: String) -> String {
            let simple = s.allSatisfy { $0.isNumber || $0.isLetter || $0 == "." || $0 == "′" || $0 == "\u{0305}" }
            return simple ? s : "(\(s))"
        }

        func script(_ s: String, table: [Character: Character], fallbackPrefix: String) -> String {
            let mapped = s.map { table[$0] }
            if !s.isEmpty, mapped.allSatisfy({ $0 != nil }) { return String(mapped.compactMap { $0 }) }
            return s.count == 1 ? fallbackPrefix + s : fallbackPrefix + "(" + s + ")"
        }
    }
}

/// The material's voice: serif text with maths.
struct MaterialText: View {
    let text: String
    var font: Font = .reading
    var color: Color = Theme.graphite

    init(_ text: String, font: Font = .reading, color: Color = Theme.graphite) {
        self.text = text; self.font = font; self.color = color
    }

    var body: some View {
        Text(MathText.attributed(text))
            .font(font)
            .foregroundStyle(color)
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }
}
