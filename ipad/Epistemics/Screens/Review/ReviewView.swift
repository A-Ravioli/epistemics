import SwiftUI
import PencilKit
import EpistemicsCore

struct ReviewView: View {
    @Environment(AppModel.self) private var app
    @State private var model: ReviewSessionModel

    init(model: ReviewSessionModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: model.phase == .done ? "Reviews" : "Review · \(min(model.answered + 1, max(model.total, 1))) of \(max(model.total, 1))",
                          closeLabel: "Stop reviewing", onClose: { app.dismissSession() }) {
                if model.minutesLeft > 0, model.phase != .done {
                    Text("about \(model.minutesLeft) min left").font(.secondary).foregroundStyle(Theme.muted)
                }
            }
            content
        }
        .background(Theme.paper.ignoresSafeArea())
        .task { await model.start() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            Spacer(); WorkingLine(text: "Finding what's due…"); Spacer()
        case .done:
            done
        case .failed(let message):
            ScrollView {
                PageColumn {
                    Banner(text: message, actionTitle: "Try again") { Task { await model.retry() } }
                }.padding(32)
            }
        case .receipt(let result):
            if let cur = model.current { ReceiptPage(item: cur.item, area: cur.area, result: result, model: model) }
        default:
            if let cur = model.current { answerPage(cur) }
        }
    }

    private func answerPage(_ cur: ReviewSessionModel.Current) -> some View {
        let hand = app.settings.handedness
        return VStack(spacing: 0) {
            ScrollView {
                FreeHandLayout(handedness: hand) {
                    if !model.typedMode, model.phase == .answering { ToolTray(tools: app.tools, showsLasso: cur.area.paper != .short) }
                } page: {
                    PageColumn {
                        MaterialText(cur.item.prompt, font: .readingLarge)
                        if model.typedMode {
                            TypedAnswer(text: Binding(get: { model.current?.typed ?? "" }, set: { model.current?.typed = $0 }),
                                        editable: model.phase == .answering)
                        } else {
                            InkArea(area: cur.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                                .onChange(of: cur.area.revision) { model.inkChanged() }
                        }
                        switch model.phase {
                        case .answering:
                            PageNote(text: "Nothing on this page holds the answer. Your notebook stays shut until you hand in.")
                        case .reading:
                            WorkingLine(text: "Reading your answer…")
                        case .grading:
                            WorkingLine(text: "Grading against the rubric. The grader sees only the words, never your page.")
                        case .confirming(let r):
                            ConfirmReadingView(reading: r) { text in Task { await model.confirm(r, text: text) } }
                        case .reveal(let r):
                            SelfGradeReveal(item: cur.item, reading: r, model: model)
                        default:
                            EmptyView()
                        }
                    }
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
                .padding(.horizontal, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            if model.phase == .answering {
                ConfidenceHandIn(enabled: model.typedMode ? !(model.current?.typed.isEmpty ?? true) : !cur.area.isEmpty,
                                 onHandIn: { c in Task { await model.handIn(c) } },
                                 onDontKnow: { Task { await model.dontKnow() } })
                    .environment(\.layoutDirection, hand == .left ? .rightToLeft : .leftToRight)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .background(Theme.paper)
            }
        }
    }

    private var done: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("That's everything due.").font(.display).foregroundStyle(Theme.graphite)
            Text("\(model.answered) answered by hand. They will come back when you're about to forget them.")
                .font(.body15).foregroundStyle(Theme.muted)
            Button("Back to Today") { app.dismissSession() }.buttonStyle(.primaryLarge)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

/// The typed fallback (DESIGN §10), shown only when the setting is on.
struct TypedAnswer: View {
    @Binding var text: String
    var editable: Bool
    var body: some View {
        TextEditor(text: $text)
            .font(.readingSmall)
            .frame(minHeight: 160)
            .scrollContentBackground(.hidden)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 16).fill(Theme.sheet))
            .disabled(!editable)
            .accessibilityLabel("Your answer")
    }
}

/// Self-graded types: the reference beside the learner's ink; the learner rates (DESIGN §6.4).
struct SelfGradeReveal: View {
    let item: Item
    let reading: InkReading
    let model: ReviewSessionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("The answer").font(.secondary).foregroundStyle(Theme.muted)
            MaterialText(item.reference.answer, font: .readingSmall)
            if !reading.text.isEmpty {
                Text("You wrote: \(reading.text)").font(.secondary).foregroundStyle(Theme.muted)
            }
            Text("How did you do?").font(.heading).foregroundStyle(Theme.graphite)
            HStack(spacing: 10) {
                ForEach(Rating.allCases, id: \.self) { r in
                    Button(r.label) { Task { await model.selfRate(r, reading: reading) } }
                        .buttonStyle(.secondaryLarge)
                }
            }
            PageNote(text: "Again if you missed it, Hard if it was a struggle, Good if you had it, Easy if it was instant.")
        }
    }
}

/// The receipt (DESIGN §6.4): your ink with numbered blue marks, the criteria beside it, the rating, and
/// the attempt from last time, shown only now that this one is handed in.
struct ReceiptPage: View {
    let item: Item
    let area: InkAreaModel
    let result: ReviewSessionModel.ReviewResult
    let model: ReviewSessionModel
    @Environment(AppModel.self) private var app

    var body: some View {
        ScrollView {
            HStack(alignment: .top, spacing: 48) {
                VStack(alignment: .leading, spacing: 18) {
                    MaterialText(item.prompt, font: .reading)
                    if model.typedMode {
                        MaterialText(result.reading.text, font: .readingSmall)
                    } else {
                        InkSnapshot(drawing: area.drawing, paper: area.paper, marks: result.marks)
                            .background(RoundedRectangle(cornerRadius: 16).fill(Theme.sheet))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        Text(readLine).font(.secondary).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    if let prev = result.previous {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(prev.daysAgo == 0 ? "You answered this earlier today" : "You answered this \(prev.daysAgo) day\(prev.daysAgo == 1 ? "" : "s") ago")
                                .font(.secondary.weight(.semibold)).foregroundStyle(Theme.muted)
                            InkSnapshot(drawing: prev.drawing, paper: prev.paper, marks: prev.marks, maxHeight: 120)
                                .frame(maxWidth: 440)
                                .opacity(0.75)
                                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.sheet))
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .padding(.top, 8)
                    }
                }
                .frame(maxWidth: 600)

                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(result.rating.label).font(.title2x).foregroundStyle(Theme.graphite)
                        Text(verdict).font(.body15).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    if let graded = result.graded {
                        CriteriaList(rubric: GradingService.target(for: item, in: model.ctx.curriculum).rubric, grade: graded.grade, marks: result.marks)
                        MaterialText(graded.grade.feedback, font: .readingSmall)
                    } else if item.type.isSelfGraded {
                        MaterialText(item.reference.answer, font: .readingSmall)
                    } else {
                        Text("The answer").font(.secondary).foregroundStyle(Theme.muted)
                        MaterialText(item.reference.answer, font: .readingSmall)
                    }
                    if result.leech {
                        Text("You've missed this one eight times, so it's set aside for rewriting rather than asked again.")
                            .font(.body15).foregroundStyle(Theme.warn)
                    }
                    HStack(spacing: 12) {
                        Button("Next") { Task { await model.next() } }.buttonStyle(.primaryLarge)
                        if result.graded != nil {
                            Button("Dispute the grade") { Task { await model.dispute(result) } }.buttonStyle(.ghost)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 48)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
    }

    private var readLine: String {
        let text = result.reading.gradedText
        let confirmed = result.reading.confirmedText != nil
        return (confirmed ? "Graded from the reading you confirmed: " : "Read as: ") + "“\(text)”. The grader never saw your page, only these words."
    }

    private var verdict: String {
        var parts: [String] = []
        if let c = model.confidence {
            let right = isCorrect(result.rating)
            switch (c, right) {
            case (.certain, true): parts.append("You said certain, and you were right.")
            case (.certain, false): parts.append("You said certain and missed it: that's the most fixable kind of error, so it comes back today.")
            case (.guess, true): parts.append("Right, but you were guessing, so it counts as Hard.")
            case (.guess, false), (.fairlySure, false): parts.append("Not this time.")
            case (.fairlySure, true): parts.append("You had it.")
            }
        }
        parts.append(result.nextDueText.prefix(1).uppercased() + result.nextDueText.dropFirst() + ".")
        return parts.joined(separator: " ")
    }
}

/// Rubric criteria, numbered to match the marks on the ink.
struct CriteriaList: View {
    let rubric: [RubricCriterion]
    let grade: GradeResult
    let marks: [InkMark]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(rubric.enumerated()), id: \.element.id) { index, c in
                let met = grade.criteria.first { $0.id == c.id }?.met ?? false
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(met ? .white : Theme.muted)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(met ? Theme.tutor : Theme.fill))
                    Text(c.text).font(.body15).foregroundStyle(met ? Theme.graphite : Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(met ? "Met" : "Not met"): \(c.text)")
            }
        }
    }
}
