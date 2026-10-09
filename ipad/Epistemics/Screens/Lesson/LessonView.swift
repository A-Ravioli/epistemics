import SwiftUI
import EpistemicsCore

/// A lesson (DESIGN §3.3, ipad §6.3): the page is the conversation. The tutor's turns in the serif, the
/// learner's answers as ink beneath them, one blue mark at most per turn, and the page above folded away
/// whenever the learner is answering without help.
struct LessonView: View {
    @Environment(AppModel.self) private var app
    @State private var model: LessonSessionModel
    @State private var jol: [String: Double] = [:]

    init(model: LessonSessionModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: model.concept?.name ?? model.lesson?.title ?? "Lesson",
                          subtitle: [model.lesson?.title, model.phaseLine].compactMap { $0 }.joined(separator: " · "),
                          closeLabel: "Leave the lesson", onClose: { app.dismissSession() }) {
                Button("Concept") { model.showsConcept = true }
                    .buttonStyle(.secondary)
                    .disabled(model.phase.isUnaided || model.concept == nil)
                    .accessibilityHint(model.phase.isUnaided ? "Hidden while you answer without help" : "")
            }
            ScrollViewReader { proxy in
                ScrollView {
                    FreeHandLayout(handedness: app.settings.handedness) {
                        if model.canWrite && model.inputMode != .jol {
                            VStack(spacing: 16) {
                                ToolTray(tools: app.tools)
                                if model.inputMode == .answer || model.inputMode == .summary {
                                    Button { Task { await model.handIn() } } label: {
                                        Text("Hand\nin").font(.system(size: 14, weight: .semibold)).multilineTextAlignment(.center)
                                            .foregroundStyle(Theme.onGraphite)
                                            .frame(width: 72, height: 72)
                                            .background(Circle().fill(Theme.graphite))
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(model.activeArea.isEmpty)
                                    .opacity(model.activeArea.isEmpty ? 0.4 : 1)
                                    .accessibilityLabel("Hand in")
                                }
                            }
                        }
                    } page: {
                        page.padding(.top, 8).padding(.bottom, 60)
                    }
                    .padding(.horizontal, 20)
                    Color.clear.frame(height: 1).id("bottom")
                }
                .onChange(of: model.entries.count) { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: model.streaming) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            if model.inputMode == .answerConfidence && model.canWrite {
                ConfidenceHandIn(enabled: !model.activeArea.isEmpty,
                                 onHandIn: { c in Task { await model.handIn(confidence: c) } },
                                 onDontKnow: { Task { await model.giveUp() } })
                    .environment(\.layoutDirection, app.settings.handedness == .left ? .rightToLeft : .leftToRight)
                    .padding(.horizontal, 20).padding(.vertical, 16)
                    .background(Theme.paper)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .task { await model.start() }
        .sheet(isPresented: $model.showsConcept) { ConceptSheet(concept: model.concept) }
    }

    @ViewBuilder
    private var page: some View {
        PageColumn {
            let visible = visibleEntries
            if visible.count < model.entries.count {
                PageNote(text: "Earlier on this page is hidden until you hand this in.")
            }
            ForEach(visible) { entry in
                switch entry.kind {
                case .tutor:
                    MaterialText(entry.text, color: entry.id == visible.last(where: { $0.kind == .tutor })?.id ? Theme.graphite : Theme.graphite.opacity(0.6))
                case .learner:
                    if let area = entry.area {
                        VStack(alignment: .leading, spacing: 4) {
                            InkSnapshot(drawing: area.drawing, paper: area.paper, marks: area.marks, maxHeight: 520, showsPaper: false)
                                .accessibilityLabel("Your answer, read as: \(entry.text)")
                            Button("Read as “\(entry.text.prefix(80))”. Not what you wrote?") { model.misread(entry) }
                                .font(.caption12).foregroundStyle(Theme.muted).buttonStyle(.plain)
                        }
                    }
                case .note:
                    PageNote(text: entry.text)
                }
            }
            if let s = model.streaming {
                MaterialText(s.isEmpty ? "…" : s)
            }
            status
            input
        }
    }

    /// In PRIME, PROBE and CHECK only the current question shows (DESIGN §3).
    private var visibleEntries: [LessonEntry] {
        guard model.foldsPage, model.canWrite || model.pendingConfirmation != nil,
              let lastTutor = model.entries.lastIndex(where: { $0.kind == .tutor }) else { return model.entries }
        return Array(model.entries[lastTutor...])
    }

    @ViewBuilder
    private var status: some View {
        if let error = model.error {
            Banner(text: error, actionTitle: "Try again") { Task { await model.retry() } }
        } else if let busy = model.busy, model.streaming == nil {
            switch busy {
            case .reading: WorkingLine(text: "Reading your answer…")
            case .observer: WorkingLine(text: "Reading what you did…")
            case .grading: WorkingLine(text: "Checking it against the rubric…")
            case .saving: WorkingLine(text: "Saving the lesson…")
            case .tutor, .working: WorkingLine(text: "Thinking…")
            }
        }
    }

    @ViewBuilder
    private var input: some View {
        if let p = model.pendingConfirmation {
            ConfirmReadingView(reading: p.reading) { text in Task { await model.confirmPending(text: text) } }
        } else if model.canWrite || model.busy == .reading {
            switch model.inputMode {
            case .answer, .answerConfidence:
                InkArea(area: model.activeArea, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                    .onChange(of: model.activeArea.revision) { model.inkChanged() }
                PageNote(text: model.inputMode == .answerConfidence
                         ? "No help here. Have a go even if you're unsure; a wrong guess still helps you learn it."
                         : "The page grows as you write. Hand in when you've said it.")
            case .summary:
                MaterialText("To finish: in three to five sentences, what was this lesson about? Write it from memory.")
                InkArea(area: model.activeArea, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                    .onChange(of: model.activeArea.revision) { model.inkChanged() }
            case .jol, .done:
                EmptyView()
            }
        }
        if model.inputMode == .jol, model.busy == nil {
            jolPanel
        }
        if model.inputMode == .done {
            VStack(alignment: .leading, spacing: 12) {
                Text("Lesson done.").font(.title2x).foregroundStyle(Theme.graphite)
                Text("What you learned here now comes back on a schedule, until you keep it.").font(.body15).foregroundStyle(Theme.muted)
                Button("Back to Today") { app.dismissSession() }.buttonStyle(.primaryLarge)
            }
            .padding(.top, 12)
        }
    }

    /// The delayed judgement of learning (DESIGN §3.2): will you still be able to explain it in a week?
    private var jolPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            MaterialText("Last thing. A week from now, which of these will you still be able to explain without help?")
            ForEach(model.lesson?.concepts ?? []) { c in
                VStack(alignment: .leading, spacing: 8) {
                    Text(c.name).font(.heading).foregroundStyle(Theme.graphite)
                    HStack(spacing: 8) {
                        ForEach([("Probably not", 0.2), ("Maybe", 0.5), ("Yes", 0.85)], id: \.0) { label, p in
                            let selected = jol[c.id] == p
                            Button(label) { jol[c.id] = p }
                                .foregroundStyle(selected ? Theme.onGraphite : Theme.graphite)
                                .padding(.horizontal, 16).frame(minHeight: 40)
                                .background(Capsule().fill(selected ? Theme.graphite : Theme.fill))
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
            Button("Finish the lesson") { Task { await model.submitJol(jol) } }
                .buttonStyle(.primaryLarge)
                .disabled(jol.count < (model.lesson?.concepts.count ?? 0))
        }
    }
}

/// The concept's context, available only while help is allowed.
struct ConceptSheet: View {
    let concept: Concept?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                if let c = concept {
                    VStack(alignment: .leading, spacing: 16) {
                        MaterialText(c.definition)
                        Text("You should be able to").font(.heading)
                        ForEach(c.objectives, id: \.id) { o in MaterialText("· " + o.text, font: .readingSmall) }
                        if !c.examples.isEmpty {
                            Text("Examples").font(.heading)
                            ForEach(c.examples, id: \.title) { e in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(e.title).font(.body15.weight(.semibold))
                                    MaterialText(e.body, font: .readingSmall)
                                }
                            }
                        }
                    }
                    .padding(28)
                }
            }
            .background(Theme.paper)
            .navigationTitle(concept?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
