import Foundation

/// The prompt files bundled in `Prompts/` (port of prompts.ts). The web prompts are byte-identical copies of
/// `web/content/prompts/*.md` (asserted by a test); the iPad-only ones are `reader`, `observer-ink` and `tutor-ink`.
public enum PromptName: String, Sendable, Hashable, CaseIterable {
    case tutorCharter = "tutor-charter"
    case observer
    case grader
    case student
    case leakcheck
    case warmup
    case architectOutline = "architect-outline"
    case architectConcepts = "architect-concepts"
    case architectGraph = "architect-graph"
    case architectScripts = "architect-scripts"
    case architectItems = "architect-items"
    case architectItemcheck = "architect-itemcheck"
    // iPad only
    case reader
    case observerInk = "observer-ink"
    case tutorInk = "tutor-ink"

    /// File name in `Prompts/` (and, for web prompts, in `web/content/prompts/`).
    public var fileName: String { rawValue + ".md" }

    /// Prompts that exist only in the iPad app.
    public var isIPadOnly: Bool { self == .reader || self == .observerInk || self == .tutorInk }
}

public enum Prompts {
    private static let loaded: [PromptName: String] = {
        var out: [PromptName: String] = [:]
        for name in PromptName.allCases {
            guard let url = Bundle.module.url(forResource: name.rawValue, withExtension: "md", subdirectory: "Prompts")
                    ?? Bundle.module.url(forResource: name.rawValue, withExtension: "md"),
                  let data = try? Data(contentsOf: url),
                  let text = String(data: data, encoding: .utf8)
            else { preconditionFailure("EpistemicsLLM: prompt \(name.fileName) is missing from the bundle") }
            out[name] = text
        }
        return out
    }()

    /// The prompt's full text, exactly as in the file.
    public static func text(_ name: PromptName) -> String { loaded[name]! }

    /// The `<!-- version: x.y -->` header of a prompt.
    public static func version(_ name: PromptName) -> String { version(of: text(name)) }

    /// Reads the `<!-- version: x.y -->` header at the very start of `text`; "0.0" when absent.
    public static func version(of text: String) -> String {
        let r = try! NSRegularExpression(pattern: "^<!--\\s*version:\\s*([^\\s]+)\\s*-->")
        guard let m = r.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(m.range(at: 1), in: text) else { return "0.0" }
        return String(text[range])
    }

    /// Every prompt's version, for logging alongside calls.
    public static var versions: [PromptName: String] {
        Dictionary(uniqueKeysWithValues: PromptName.allCases.map { ($0, version($0)) })
    }

    public static var tutorCharter: String { text(.tutorCharter) }
    public static var observer: String { text(.observer) }
    public static var grader: String { text(.grader) }
    public static var student: String { text(.student) }
    public static var leakcheck: String { text(.leakcheck) }
    public static var warmup: String { text(.warmup) }
    public static var reader: String { text(.reader) }
    public static var observerInk: String { text(.observerInk) }
    public static var tutorInk: String { text(.tutorInk) }

    /// The tutor's system prompt on the iPad: the web charter, a blank line, then the ink addendum without its
    /// version header.
    public static var tutorCharterInk: String { tutorCharter + "\n" + body(.tutorInk) }
    /// The observer's system prompt on the iPad: the web prompt, a blank line, then the ink addendum (marks, ink
    /// summary) without its version header.
    public static var observerWithInk: String { observer + "\n" + body(.observerInk) }

    /// The prompt without its leading `<!-- version: … -->` line.
    public static func body(_ name: PromptName) -> String {
        let t = text(name)
        guard t.hasPrefix("<!--"), let end = t.range(of: "-->") else { return t }
        var rest = t[end.upperBound...]
        if rest.hasPrefix("\n") { rest = rest.dropFirst() }
        return String(rest)
    }
}
