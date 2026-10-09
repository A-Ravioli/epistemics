import Foundation
import EpistemicsCore

/// The state machine's instruction for one tutor turn (the LLM-side input; the app maps core's lesson control to it).
public struct TutorTurnControl: Sendable, Hashable {
    public var phase: LessonPhase
    public var conceptId: String
    /// 0...3; the state machine raises it only after an observed attempt.
    public var hintLevel: Int
    public var maxWords: Int
    /// Free-text instruction ("ask guiding question 2", "run CONSOLIDATE", …).
    public var instruction: String
    /// May the tutor use the curriculum context's hint text at the current level? Default: hintLevel > 0.
    public var allowHintContent: Bool?
    /// Objective in play, e.g. "O2".
    public var objectiveId: String?
    /// Two attempts (or a give-up) recorded: the tutor may reveal the reference the state machine supplies.
    public var revealAllowed: Bool
    /// iPad: the span of the learner's ink the app has marked for this turn (from the observer), if any.
    public var markedQuote: String?

    public init(phase: LessonPhase, conceptId: String, hintLevel: Int, maxWords: Int, instruction: String,
                allowHintContent: Bool? = nil, objectiveId: String? = nil, revealAllowed: Bool = false, markedQuote: String? = nil) {
        self.phase = phase; self.conceptId = conceptId; self.hintLevel = hintLevel; self.maxWords = maxWords
        self.instruction = instruction; self.allowHintContent = allowHintContent; self.objectiveId = objectiveId
        self.revealAllowed = revealAllowed; self.markedQuote = markedQuote
    }
}

public struct TutorInput: Sendable, Hashable {
    /// System prompt; defaults to the web charter plus the iPad ink addendum (`Prompts.tutorCharterInk`).
    public var charter: String?
    public var curriculumContext: String
    public var learnerModelText: String
    /// Prior dialogue: learner = user (may carry an image of a drawing), tutor = assistant.
    public var transcript: [ChatMessage]
    public var control: TutorTurnControl
    public var model: String?
    public var effort: Effort?
    public var maxTokens: Int?
    public var metadata: RequestMetadata?

    public init(charter: String? = nil, curriculumContext: String, learnerModelText: String, transcript: [ChatMessage],
                control: TutorTurnControl, model: String? = nil, effort: Effort? = nil, maxTokens: Int? = nil,
                metadata: RequestMetadata? = nil) {
        self.charter = charter; self.curriculumContext = curriculumContext; self.learnerModelText = learnerModelText
        self.transcript = transcript; self.control = control; self.model = model; self.effort = effort
        self.maxTokens = maxTokens; self.metadata = metadata
    }
}

public struct CurriculumContextOptions: Sendable, Hashable {
    /// Extra grounding spans (e.g. retrieved chunks) beyond the concepts' own.
    public var spans: [SourceSpan]
    /// Whether a source is loaded (the tutor is told to cite). Default: any span present.
    public var sourcesLoaded: Bool?
    /// Render the lesson's other concepts briefly. Default true.
    public var includeOtherConcepts: Bool
    public init(spans: [SourceSpan] = [], sourcesLoaded: Bool? = nil, includeOtherConcepts: Bool = true) {
        self.spans = spans; self.sourcesLoaded = sourcesLoaded; self.includeOtherConcepts = includeOtherConcepts
    }
}

public enum TutorTurnOutcome: Sendable, Hashable {
    /// A turn ready to render (after at most one shape regeneration).
    case turn(text: String, usage: Usage, shape: TurnShape, regenerated: Bool)
    /// The finished text leaked a hidden reference: dispatch the state machine's leak event, do not render.
    case leaked(text: String, verdict: LeakVerdict, usage: Usage)
}

public enum TutorError: Error, Sendable, Hashable {
    /// A template change would put a reference answer into the tutor's context.
    case referenceLeaked([String])
    case lessonHasNoConcepts
}

/// Tutor call assembly (port of roles/tutor.ts, DESIGN §7.2):
///
///     system[0] (cached 1h)   : tutor charter + iPad ink addendum
///     system[1] (cached 1h)   : curriculum context — NO reference answers
///     messages[0] user (cached): learner model summary + lesson state
///     messages[1...]          : dialogue; the control message is appended last as role:system
public enum Tutor {
    /// Render the control message. The key=value line comes first so it is greppable in logs.
    public static func renderControl(_ c: TutorTurnControl) -> String {
        var kv = ["phase=\(c.phase.rawValue)", "concept=\(c.conceptId)", "hint_level=\(c.hintLevel)", "max_words=\(c.maxWords)"]
        if let o = c.objectiveId, !o.isEmpty { kv.append("objective=\(o)") }
        kv.append("reveal=\(c.revealAllowed ? "allowed" : "forbidden")")
        let allowHint = c.allowHintContent ?? (c.hintLevel > 0)
        let hintLine = c.hintLevel <= 0
            ? "No hint yet: ask a question the learner can answer from what they already know."
            : allowHint
                ? "You may use hint level \(c.hintLevel) (and lower) from the curriculum context. Do not go beyond it."
                : "Hint level \(c.hintLevel) is the ceiling, but do not quote the curriculum context's hint text; rephrase at that level."
        let revealLine = c.revealAllowed ? "" : "\nDo not state the answer to the pretest, transfer or check question."
        var markLine = ""
        if let q = c.markedQuote?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            markLine = "\nA mark is shown on the learner's ink at: \"\(q)\"."
        }
        let lengthLine = "\nAt most one question. At most \(c.maxWords) words."
        return "\(kv.joined(separator: " "))\n\(c.instruction.trimmingCharacters(in: .whitespacesAndNewlines))\n\(hintLine)\(revealLine)\(markLine)\(lengthLine)"
    }

    public static func buildRequest(_ input: TutorInput) -> LlmRequest {
        var messages: [ChatMessage] = [.user(input.learnerModelText, cache: true)]
        messages += input.transcript.map { ChatMessage(role: $0.role, content: $0.content, images: $0.images) }
        messages.append(.system(renderControl(input.control)))
        // max_tokens must also cover adaptive thinking, so the provider default (4096) stays unless overridden
        return LlmRequest(role: .tutor, model: input.model,
                          system: [CacheableBlock(input.charter ?? Prompts.tutorCharterInk, cache: true),
                                   CacheableBlock(input.curriculumContext, cache: true)],
                          messages: messages, maxTokens: input.maxTokens, effort: input.effort ?? .medium,
                          metadata: input.metadata)
    }

    // MARK: Curriculum context

    private static func t(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

    static func renderSpan(_ s: SourceSpan) -> String {
        let whereParts = [s.page.map { "p. \($0)" } ?? "", s.heading.map { "\"\($0)\"" } ?? ""].filter { !$0.isEmpty }
        let whereText = whereParts.joined(separator: ", ")
        return "- \(whereText.isEmpty ? "" : "(\(whereText)) ")\"\(t(s.quote))\""
    }

    static func renderConceptFull(_ c: Concept, extraSpans: [SourceSpan]) -> String {
        var lines: [String] = []
        lines += ["## Concept in focus: \(c.name) (id \(c.id))", "", "Definition: \(t(c.definition))", ""]
        lines.append("### Objectives")
        for o in c.objectives { lines.append("- \(o.id) [\(o.bloom.rawValue)]: \(t(o.text))") }
        lines.append("")
        if !c.misconceptions.isEmpty {
            lines.append("### Known misconceptions")
            for m in c.misconceptions { lines.append("- \(m.tag): \(t(m.description)) Remedy: \(t(m.remedy))") }
            lines.append("")
        }
        if !c.examples.isEmpty {
            lines.append("### Examples")
            for e in c.examples { lines.append("- \(t(e.title))\(e.domain.map { " (\($0))" } ?? ""): \(t(e.body))") }
            lines.append("")
        }
        let spans = c.spans + extraSpans
        if !spans.isEmpty {
            lines.append("### Source spans (cite these; do not invent others)")
            for s in spans { lines.append(renderSpan(s)) }
            lines.append("")
        }
        let s = c.script
        lines.append("### Lesson script")
        lines += ["Pretest question (pose it; never answer it): \(t(s.pretest.prompt))", ""]
        lines.append("Guiding question plan (ask in order; each \"expects\" is what a good learner answer contains, not text to say):")
        for (i, q) in s.guidingQuestions.enumerated() {
            lines.append("\(i + 1). \(t(q.question)) — expects: \(t(q.expected))\(q.probesMisconception.map { " [probes: \($0)]" } ?? "")")
        }
        lines.append("")
        lines.append("Worked example (for faded-example scaffolding and hint level 3): \(t(s.workedExample.problem))")
        for (i, step) in s.workedExample.steps.enumerated() { lines.append("  step \(i + 1): \(t(step))") }
        lines.append("")
        lines += ["Transfer question (pose it; never answer it): \(t(s.transfer.prompt))", ""]
        lines.append("Hint ladder (use only up to the level the control message allows):")
        for (i, h) in s.hints.enumerated() { lines.append("- level \(i + 1): \(t(h))") }
        lines.append("")
        return lines.joined(separator: "\n")
    }

    static func renderConceptBrief(_ c: Concept) -> String {
        let objectives = c.objectives.map { "\($0.id): \(t($0.text))" }.joined(separator: "; ")
        return "- \(c.name) (id \(c.id)): \(t(c.definition)) Objectives: \(objectives)"
    }

    /// The cached curriculum context for a lesson: definitions, objectives, misconceptions, examples, source spans,
    /// the guiding-question plan and hints of the focus concept. NEVER includes `script.pretest.reference`,
    /// `script.transfer.reference` or any item reference; throws `TutorError.referenceLeaked` if one slipped in.
    public static func buildCurriculumContext(_ lesson: Lesson, focusConceptId: String,
                                              options: CurriculumContextOptions = CurriculumContextOptions()) throws -> String {
        guard let focus = lesson.concepts.first(where: { $0.id == focusConceptId }) ?? lesson.concepts.first else {
            throw TutorError.lessonHasNoConcepts
        }
        let anySpans = !options.spans.isEmpty || lesson.concepts.contains { !$0.spans.isEmpty }
        let sourcesLoaded = options.sourcesLoaded ?? anySpans
        var lines: [String] = ["# Lesson \(lesson.ordinal): \(t(lesson.title))"]
        if let summary = lesson.summary, !summary.isEmpty { lines += ["", t(summary)] }
        lines.append("")
        lines.append(sourcesLoaded
            ? "Grounding: a source is loaded. Ground factual claims in the source spans below and cite page or heading. Say when a claim is not covered."
            : "Grounding: no source is loaded. Do not cite pages or quotations.")
        lines.append("")
        lines.append(renderConceptFull(focus, extraSpans: options.spans))
        let others = lesson.concepts.filter { $0.id != focus.id }
        if options.includeOtherConcepts, !others.isEmpty {
            lines.append("## Other concepts in this lesson")
            for c in others { lines.append(renderConceptBrief(c)) }
            lines.append("")
        }
        let text = lines.joined(separator: "\n")
        let leaks = referenceLeaks(text, lesson: lesson)
        if !leaks.isEmpty { throw TutorError.referenceLeaked(leaks) }
        return text
    }

    /// All hidden reference strings of a lesson (pretest, transfer, item answers, exact answers, notes).
    public static func hiddenReferences(_ lesson: Lesson) -> [String] {
        var out: [String] = []
        for c in lesson.concepts {
            out += [c.script.pretest.reference, c.script.transfer.reference]
            for it in c.items {
                out.append(it.reference.answer)
                if let e = it.reference.exact { out.append(e) }
                if let n = it.reference.notes { out.append(n) }
            }
        }
        return out.map(t).filter { !$0.isEmpty }
    }

    /// Reference strings (≥ 12 UTF-16 units, to skip trivially short answers like "42") appearing verbatim in `text`.
    public static func referenceLeaks(_ text: String, lesson: Lesson) -> [String] {
        hiddenReferences(lesson).filter { $0.utf16.count >= 12 && text.contains($0) }
    }

    /// Hidden references the tutor must not reveal in `phase` (the pretest's always; the transfer's in EXTEND).
    public static func leakReferences(for concept: Concept?, phase: LessonPhase) -> [LeakReference] {
        guard let concept else { return [] }
        var refs = [LeakReference(answer: concept.script.pretest.reference)]
        if phase == .extend { refs.append(LeakReference(answer: concept.script.transfer.reference)) }
        return refs
    }

    // MARK: One turn

    /// Stream a tutor turn, enforce its shape and check it for leaks (the web LessonRunner's `callTutor`):
    /// 1. stream the turn, reporting the accumulated text through `onText` (it restarts from "" on a regeneration);
    /// 2. if it has more than one question mark outside code or exceeds `maxWords`, regenerate once with a stricter
    ///    instruction (the second attempt is kept whatever its shape);
    /// 3. run the leak detector (heuristics, then the leakcheck model via `leakProvider` when inconclusive) against
    ///    each of `leakReferences`. A leak returns `.leaked`; the state machine decides between a stricter retry and
    ///    a canned hint.
    public static func runTurn(_ provider: any LLMProvider, input: TutorInput, leakReferences: [LeakReference],
                               leakProvider: (any LLMProvider)? = nil,
                               onText: (@Sendable (String) -> Void)? = nil) async throws -> TutorTurnOutcome {
        let control = input.control
        var current = input
        var text = ""
        var usage = Usage.zero
        var shape = TurnShape(ok: true, questions: 0, words: 0)
        var regenerated = false
        for attempt in 0..<2 {
            let r = try await provider.streamText(buildRequest(current), onText: onText)
            text = r.text.trimmingCharacters(in: .whitespacesAndNewlines)
            usage = usage + r.usage
            shape = Leak.checkTurnShape(text, maxWords: control.maxWords)
            if shape.ok || attempt == 1 { break }
            regenerated = true
            current.control.instruction = "REGENERATE: your previous reply had \(shape.questions) questions and \(shape.words) words; "
                + "ask at most one question in at most \(control.maxWords) words. \(control.instruction)"
        }
        for ref in leakReferences {
            let v = try await Leak.detect(text, reference: ref, provider: leakProvider ?? provider, metadata: input.metadata)
            if v.leaked { return .leaked(text: text, verdict: v, usage: usage) }
        }
        return .turn(text: text, usage: usage, shape: shape, regenerated: regenerated)
    }
}
