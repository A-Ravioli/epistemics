import Foundation
import Testing
@testable import EpistemicsLLM

@Suite("Text utilities (JS regex parity)")
struct TextTests {
    @Test func normalise() {
        #expect(TextUtil.normalise("  The Answer is: MITOCHONDRIA!! ") == "the answer is mitochondria")
        #expect(TextUtil.normalise("x = 3.50. Done.") == "x 3.50 done")
        #expect(TextUtil.normalise("Café — naïve résumé") == "cafe naive resume")
        #expect(TextUtil.normalise("well-known -dash- and - alone") == "well-known dash and alone")
        #expect(TextUtil.normalise("P(A|B) = P(A)") == "p a b p a")
        #expect(TextUtil.normalise("ﬁne ２ cups") == "fine 2 cups") // NFKD compatibility forms
        #expect(TextUtil.normalise("1,000.5 m/s") == "1 000.5 m s")
        #expect(TextUtil.normalise("π-day") == "π day") // JS \w is ASCII-only: the dash after π is dropped
        #expect(TextUtil.normalise("a\u{00A0}b\u{2003}c\u{FEFF}") == "a b c")
        #expect(TextUtil.normalise("") == "")
        #expect(TextUtil.normalise("?!.") == "")
    }

    @Test func wordsStemsAndContentWords() {
        #expect(TextUtil.words("Hello, world.") == ["hello", "world"])
        #expect(TextUtil.words("") == [])
        #expect(TextUtil.stem("events") == "event")
        #expect(TextUtil.stem("class") == "class")
        #expect(TextUtil.stem("bus") == "bus")
        #expect(TextUtil.stem("analysis") == "analysis")
        #expect(TextUtil.stem("is") == "is")
        #expect(TextUtil.contentWords("The events are independent of each other") == ["event", "independent", "other"])
        #expect(TextUtil.sharedContentWords("independent events", "Events that are independent") == 2)
    }

    @Test func codeWordsAndDeltas() {
        #expect(TextUtil.stripCode("a `x ? y` b ```\nq?\n``` c") == "a   b   c")
        #expect(TextUtil.wordCount("  one two\tthree\n four ") == 4)
        #expect(TextUtil.wordCount("") == 0)
        #expect(TextUtil.wordCount("```\ncode only\n```") == 0)
        let text = "One two  three\nfour?"
        let deltas = TextUtil.splitDeltas(text)
        #expect(deltas == ["One ", "two  ", "three\n", "four?"])
        #expect(deltas.joined() == text)
        #expect(TextUtil.splitDeltas("  lead") == ["  ", "lead"])
    }
}

@Suite("Prompts")
struct PromptTests {
    /// web/content/prompts, found relative to this file.
    static var webPrompts: URL {
        URL(fileURLWithPath: #filePath).resolvingSymlinksInPath()
            .deletingLastPathComponent() // EpistemicsLLMTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // EpistemicsKit
            .deletingLastPathComponent() // ipad
            .deletingLastPathComponent() // repo
            .appendingPathComponent("web/content/prompts")
    }

    @Test(arguments: PromptName.allCases.filter { !$0.isIPadOnly })
    func bundledCopyIsByteIdenticalToTheWeb(_ name: PromptName) throws {
        let web = try Data(contentsOf: Self.webPrompts.appendingPathComponent(name.fileName))
        #expect(Data(Prompts.text(name).utf8) == web, "\(name.fileName) differs from web/content/prompts")
    }

    @Test func everyWebPromptIsBundled() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: Self.webPrompts.path).filter { $0.hasSuffix(".md") }
        let bundled = Set(PromptName.allCases.map(\.fileName))
        for f in files { #expect(bundled.contains(f), "\(f) is not bundled") }
    }

    @Test(arguments: PromptName.allCases)
    func carriesAVersionHeader(_ name: PromptName) {
        #expect(Prompts.version(name).wholeMatch(of: /\d+\.\d+/) != nil)
    }

    @Test func versionParsing() {
        #expect(Prompts.version(of: "<!-- version: 2.3 -->\n# x") == "2.3")
        #expect(Prompts.version(of: "no header") == "0.0")
        #expect(Prompts.version(of: "x\n<!-- version: 2.3 -->") == "0.0")
    }

    @Test func charterStatesTheCoreRules() {
        let c = Prompts.tutorCharter.lowercased()
        for needle in ["one question", "never", "hint", "level 3", "why", "cite", "praise", "position"] { #expect(c.contains(needle)) }
    }

    @Test func addendaAreAppendedWithoutTheirHeaders() {
        #expect(Prompts.tutorCharterInk.hasPrefix(Prompts.tutorCharter))
        #expect(Prompts.tutorCharterInk.contains("draw it rather than describe it"))
        #expect(Prompts.tutorCharterInk.components(separatedBy: "<!-- version").count == 2)
        #expect(Prompts.observerWithInk.hasPrefix(Prompts.observer))
        #expect(Prompts.observerWithInk.contains("marksAllowed"))
        let reader = Prompts.reader.lowercased()
        for needle in ["exactly", "never correct", "uncertain", "crossedout", "diagram", "not given the correct answer"] {
            #expect(reader.contains(needle), "\(needle)")
        }
        #expect(Prompts.tutorInk.lowercased().contains("never comment on handwriting"))
    }
}
