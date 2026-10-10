import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// "Fix it from here" (ipad docs/AUDIT.md #2): after a wrong review whose working has a first wrong line, the
/// learner rewrites from that line under their own ink, before the answer is shown. The tutor comes to the
/// mistake instead of waiting behind a button. Khanmigo's trial found students asked for help in only 17%
/// of the sessions where they went wrong, so here the help is the next thing on the page, not a chat box.
///
/// It is practice with help: logged as an assisted receipt, never counted towards mastery, and it does not
/// touch the card. The card's own schedule brings the skill back, as a fresh variant, for the real test.
@Observable @MainActor
final class FixIt {
    enum Phase: Equatable {
        case writing
        case reading
        case checking
        case thinking
        /// The rewrite holds up.
        case fixed
        /// Still wrong; the new first wrong line is marked on the rewrite, if there is one.
        case notYet(String?)
        case failed(String)
    }

    static let maxTutorTurns = 3
    static let maxChecks = 3

    let item: Item
    let variantId: String?
    let original: InkReading
    let error: StepError
    private let ctx: CourseContext
    private let app: AppModel
    private let service: CourseService
    private let reading: ReadingService
    private let sessionId: String

    var phase: Phase = .writing
    var area: InkAreaModel
    /// Tutor turns and the learner's attempts, in order.
    private(set) var turns: [(tutor: Bool, text: String)] = []
    private(set) var checks = 0
    var tutorTurns: Int { turns.filter(\.tutor).count }
    var canAskForHelp: Bool { tutorTurns < Self.maxTutorTurns && phase != .fixed }
    var canCheck: Bool { checks < Self.maxChecks && !area.isEmpty && [.writing].contains(phase) }
    var tutorLines: [String] { turns.filter(\.tutor).map(\.text) }

    init(item: Item, variantId: String?, original: InkReading, error: StepError, paper: Paper,
         ctx: CourseContext, app: AppModel, reading: ReadingService, sessionId: String) {
        self.item = item; self.variantId = variantId; self.original = original; self.error = error
        self.ctx = ctx; self.app = app; self.service = CourseService(ctx: ctx, store: app.store)
        self.reading = reading; self.sessionId = sessionId
        let ink = inkPaper(for: item)
        self.area = InkAreaModel(paper: paper, minHeight: InkAreaModel.defaultHeight(for: paper, lines: ink.lines.map { max(3, $0 / 2) }))
    }

    private var metadata: RequestMetadata { RequestMetadata(sessionId: sessionId, courseId: ctx.course.id) }

    /// The working up to (not including) the wrong line, then the rewrite: what the grader sees.
    func combinedAnswer(rewrite: String) -> String {
        let text = original.gradedText
        let lines = text.components(separatedBy: .newlines)
        let wrong = lines.firstIndex { Grader.quoteAppears(error.quote, in: $0) }
        let before = wrong.map { lines[..<$0].joined(separator: "\n") } ?? ""
        return before.isEmpty ? rewrite : before + "\n" + rewrite
    }

    func check() async {
        guard canCheck else { return }
        checks += 1
        area.isEditable = false
        phase = .reading
        do {
            let record = area.record(courseId: ctx.course.id, owner: .review, ownerId: sessionId, itemId: item.id)
            try await app.store.saveInk(record)
            let r = try await reading.read(area, inkId: record.id,
                                           context: ReadingContext(itemType: item.type, paper: area.paper, prompt: item.prompt, metadata: metadata))
            try await app.store.saveReading(r)
            turns.append((false, r.gradedText))
            phase = .checking
            let target = GradingService.target(for: item, in: ctx.curriculum)
            let graded = try await GradingService.grade(ctx.provider, target: target, answer: combinedAnswer(rewrite: r.gradedText),
                                                        confidence: nil, metadata: metadata)
            try await service.recordReceipt(sessionId: sessionId, itemId: item.id, conceptId: item.conceptId,
                                            answer: combinedAnswer(rewrite: r.gradedText), confidence: nil, grade: graded.grade,
                                            rating: graded.rating, assisted: true, inkId: record.id, variantId: variantId)
            if isCorrect(graded.rating) {
                area.marks = []
                phase = .fixed
            } else {
                area.marks = await MarkPlacement.firstErrorMark(graded.grade, drawing: area.drawing, reading: reading).map { [$0] } ?? []
                phase = .notYet(graded.grade.firstError?.why)
            }
            try? await app.store.saveMarks(inkId: record.id, area.marks)
            app.didChangeLearnerState()
        } catch {
            phase = .failed("Couldn't check it: \(error.localizedDescription)")
        }
    }

    /// Back to writing after a "not yet": the rewrite stays, so the learner can correct it in place.
    func keepGoing() {
        area.isEditable = true
        phase = .writing
    }

    /// One Socratic turn about the marked line, grounded in the item's worked solution (Kestin et al. 2025),
    /// which the tutor is told never to state, and checked for leaks before it is shown (Bastani et al. 2025).
    func askForHelp() async {
        guard canAskForHelp else { return }
        let before = phase
        phase = .thinking
        area.isEditable = false
        defer { area.isEditable = true }
        do {
            // What the learner has rewritten so far, if anything, is part of the conversation.
            if !area.isEmpty, before == .writing {
                let record = area.record(courseId: ctx.course.id, owner: .review, ownerId: sessionId, itemId: item.id)
                let r = try await reading.read(area, inkId: record.id,
                                               context: ReadingContext(itemType: item.type, paper: area.paper, prompt: item.prompt, metadata: metadata))
                if turns.last?.text != r.gradedText { turns.append((false, r.gradedText)) }
            }
            let text = try await tutorTurn()
            turns.append((true, text))
            phase = .writing
        } catch {
            phase = .failed("The tutor couldn't answer: \(error.localizedDescription)")
        }
    }

    private func tutorTurn() async throws -> String {
        let concept = ctx.curriculum.concept(item.conceptId)
        let level = min(3, tutorTurns + 1)
        guard let lesson = ctx.curriculum.allLessons.first(where: { $0.concepts.contains { $0.id == item.conceptId } }) else {
            return cannedHint(concept, level: level)
        }
        let context = try Tutor.buildCurriculumContext(lesson, focusConceptId: item.conceptId)
        let brief = """
        Fix-it, after a review answered by hand. The learner is rewriting their working from the first wrong line.
        Problem: \(item.prompt)
        Their working, as read from the ink:
        \(original.gradedText)
        The first wrong line (marked on their page): "\(error.quote)". What is wrong with it: \(error.why)
        Worked solution, for you only. Never state it, any line of it, or its final result: \(item.reference.answer)
        """
        var transcript: [ChatMessage] = []
        for t in turns {
            if t.tutor {
                if transcript.last?.role == .assistant { transcript.append(.user("(still stuck)")) }
                transcript.append(.assistant(t.text))
            } else {
                transcript.append(.user("My rewrite so far:\n\(t.text)"))
            }
        }
        if transcript.last?.role == .assistant { transcript.append(.user("(stuck)")) }
        let control = TutorTurnControl(
            phase: .develop, conceptId: item.conceptId, hintLevel: level, maxWords: 45,
            instruction: "Fix-it: help the learner correct the marked line of their own working. Ask one question about that line that leads them to see what is wrong with it. Do not state the corrected line, a number from it, or the final answer.",
            markedQuote: error.quote)
        let input = TutorInput(curriculumContext: context, learnerModelText: brief, transcript: transcript, control: control, metadata: metadata)
        var refs = [LeakReference(answer: item.reference.answer, exact: item.reference.exact)]
        if let exact = item.reference.exact, !exact.isEmpty { refs.append(LeakReference(answer: exact, exact: exact)) }
        switch try await Tutor.runTurn(ctx.provider, input: input, leakReferences: refs) {
        case .turn(let text, _, _, _): return text
        case .leaked: return cannedHint(concept, level: level)
        }
    }

    /// The pack's own hint ladder, when the tutor's turn gave too much away or there is no lesson to ground it.
    private func cannedHint(_ concept: Concept?, level: Int) -> String {
        guard let hints = concept?.script.hints, !hints.isEmpty else { return "Look again at the marked line. What rule does it use, and does that rule apply here?" }
        return hints[min(level, hints.count) - 1]
    }
}

/// The fix-it part of a review receipt: the tutor's questions, a fresh strip of paper, and the buttons.
struct FixItSection: View {
    @Environment(AppModel.self) private var app
    @Bindable var fix: FixIt
    /// The answer has been shown: rewriting now would be copying, so the rewrite stays as it is, unmarked by buttons.
    var closed: Bool = false
    var onShowAnswer: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Rewrite from the marked line").font(.heading).foregroundStyle(Theme.graphite)
            ForEach(Array(fix.tutorLines.enumerated()), id: \.offset) { _, line in
                MaterialText(line, font: .readingSmall, color: Theme.tutor)
            }
            HStack(alignment: .top, spacing: 12) {
                if fix.phase == .writing && !closed { ToolTray(tools: app.tools, showsLasso: false) }
                InkArea(area: fix.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
            }
            .environment(\.layoutDirection, app.settings.handedness == .left ? .rightToLeft : .leftToRight)
            switch fix.phase {
            case .reading: WorkingLine(text: "Reading your rewrite…")
            case .checking: WorkingLine(text: "Checking it…")
            case .thinking: WorkingLine(text: "Thinking about your marked line…")
            case .fixed:
                Text("Fixed. That counts as practice with help, so it doesn't change your schedule: the skill comes back on its own, as a fresh problem.")
                    .font(.body15).foregroundStyle(Theme.good).fixedSize(horizontal: false, vertical: true)
            case .notYet(let why):
                VStack(alignment: .leading, spacing: 8) {
                    Text("Not yet." + (why.map { " \($0)" } ?? "")).font(.body15).foregroundStyle(Theme.graphite)
                        .fixedSize(horizontal: false, vertical: true)
                    if fix.checks < FixIt.maxChecks && !closed {
                        Button("Keep going") { fix.keepGoing() }.buttonStyle(.secondaryLarge)
                    }
                }
            case .failed(let m): Banner(text: m, actionTitle: "Try again") { fix.keepGoing() }
            case .writing: EmptyView()
            }
            if !closed {
            HStack(spacing: 12) {
                if fix.phase == .writing {
                    Button("Check my fix") { Task { await fix.check() } }.buttonStyle(.primaryLarge).disabled(!fix.canCheck)
                    if fix.canAskForHelp {
                        Button(fix.tutorTurns == 0 ? "I'm stuck" : "Still stuck") { Task { await fix.askForHelp() } }.buttonStyle(.ghost)
                    }
                }
                if fix.phase != .fixed {
                    Button("Show me the answer", action: onShowAnswer).buttonStyle(.ghost)
                }
            }
            }
        }
        .onChange(of: closed) { if closed { fix.area.isEditable = false } }
    }
}
