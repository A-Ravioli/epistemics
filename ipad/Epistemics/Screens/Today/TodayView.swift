import SwiftUI
import EpistemicsCore

/// Today (DESIGN §3.2, ipad DESIGN §6.2): what to do next, said once in the tutor's serif, one button,
/// then a few quiet lines of state.
struct TodayView: View {
    @Environment(AppModel.self) private var app
    @State private var today: TodayState?
    @State private var error: String?

    var body: some View {
        ScrollView {
            PageColumn(width: 620) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Today").font(.display).foregroundStyle(Theme.graphite)
                    Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide))).font(.body15).foregroundStyle(Theme.muted)
                }
                if app.isDemoTutor {
                    Banner(text: "Tutor: the demo stand-in. It can't read handwriting or really teach.", actionTitle: "Choose a tutor") {
                        app.screen = .settings
                    }
                }
                if let today { content(today) } else if let error { Banner(text: error) } else { WorkingLine(text: "Opening your day…") }
            }
            .padding(.top, 72)
            .padding(.horizontal, 32)
            .padding(.bottom, 60)
        }
        .background(Theme.paper)
        .task(id: app.revision) { await load() }
    }

    private func load() async {
        guard let service = app.service else { return }
        do { today = try await service.loadToday(); error = nil } catch { self.error = "Couldn't load today: \(error)" }
    }

    @ViewBuilder
    private func content(_ t: TodayState) -> some View {
        let next = nextStep(t)
        MaterialText(next.sentence, font: .system(size: 22, design: .serif))
            .padding(.top, 28)
        if let action = next.action {
            Button(next.button, action: action).buttonStyle(.primaryLarge).padding(.top, 6)
        }
        VStack(alignment: .leading, spacing: 12) {
            ForEach(quietLines(t, skipping: next.kind), id: \.self) { line in
                Text(line).font(.body15).foregroundStyle(Theme.muted)
            }
            if let tb = t.teachback.first {
                Button("Explain \(tb.name) to a student who has never heard of it") { app.present(.teachback(conceptId: tb.conceptId)) }
                    .buttonStyle(.ghost)
                    .padding(.leading, -16)
            }
            if t.lessonLocked && !t.overrideUsedToday && !t.recoveryMode, t.nextLesson != nil, next.kind != .lesson {
                Button("Override the gate for today") { Task { await app.service?.overrideGateToday(); app.didChangeLearnerState() } }
                    .buttonStyle(.ghost)
                    .padding(.leading, -16)
            }
        }
        .padding(.top, 36)
    }

    private enum Kind { case resume, warmup, reviews, remediation, checkpoint, lesson, map, done }

    private struct NextStep {
        var kind: Kind
        var sentence: String
        var button: String = ""
        var action: (() -> Void)?
    }

    /// One next step, in the order the day is meant to go (DESIGN §3.2).
    private func nextStep(_ t: TodayState) -> NextStep {
        if let open = t.openLesson {
            return NextStep(kind: .resume, sentence: "You stopped part-way through \(open.title). Pick it up where you left it.",
                            button: "Continue the lesson") { app.present(.lesson(lessonId: open.lessonId)) }
        }
        if let w = t.warmup {
            return NextStep(kind: .warmup,
                            sentence: "Start with a blank page. Write down everything you remember from \(w.title), without looking back at it.",
                            button: "Open a blank page") { app.present(.warmup(lessonId: w.id)) }
        }
        if t.dueCount > 0 {
            let n = t.dueCount
            return NextStep(kind: .reviews, sentence: "\(n) question\(n == 1 ? " is" : "s are") due back. Answer them by hand, and say how sure you are when you hand in.",
                            button: "Start reviewing") { app.present(.review) }
        }
        if let r = t.remediation.first {
            return NextStep(kind: .remediation, sentence: "The checkpoint showed \(r.name) needs another pass. A short lesson goes back over it.",
                            button: "Go back over it") { app.present(.lesson(lessonId: LessonService.remediationPrefix + r.conceptId)) }
        }
        if let c = t.checkpoint, c.ready {
            return NextStep(kind: .checkpoint, sentence: "\(c.unit.title) is taught and practised. Time for its checkpoint: a paper, no help, handed in once.",
                            button: "Take the checkpoint") { app.present(.checkpoint(unitId: c.unit.id)) }
        }
        if let lesson = t.nextLesson, !t.lessonLocked {
            return NextStep(kind: .lesson, sentence: "Next is \(lesson.title). It opens with a question you can't answer yet; have a go anyway.",
                            button: "Start the lesson") { app.present(.lesson(lessonId: lesson.id)) }
        }
        if let unit = t.mapDue {
            return NextStep(kind: .map, sentence: "Draw \(unit.title) from memory: every idea, and how they connect.",
                            button: "Open a blank page") { app.present(.map(unitId: unit.id)) }
        }
        return NextStep(kind: .done, sentence: t.nextLesson == nil
                        ? "That's everything in this course for now. Reviews will come back as you need them."
                        : "That's today done. The next lesson opens tomorrow, once the reviews it brings are clear.")
    }

    private func quietLines(_ t: TodayState, skipping kind: Kind) -> [String] {
        var lines: [String] = []
        if kind != .reviews, t.dueCount > 0 {
            lines.append("Then \(t.dueCount) review\(t.dueCount == 1 ? "" : "s"), about \(t.queue.minutes) minutes by hand.")
        }
        if kind != .lesson, let lesson = t.nextLesson {
            if t.lessonLocked, let reason = t.lockReason {
                lines.append("\(lesson.title) opens once those are clear. \(reason)")
            } else if kind != .resume {
                lines.append("\(lesson.title) is ready.")
            }
        }
        if let w = t.waitingLesson {
            lines.append("\(w.title) opens once the ideas it builds on are secure: each has to come back right on a few separate days.")
        }
        if let c = t.checkpoint, !c.ready, let reason = c.reason {
            lines.append("\(c.unit.title)'s checkpoint: \(reason)")
        }
        if kind != .map, let unit = t.mapDue {
            lines.append("\(unit.title)'s map from memory is due.")
        }
        if t.teachback.count > 1 {
            lines.append("Also worth explaining: " + t.teachback.dropFirst().map(\.name).joined(separator: ", ") + ".")
        }
        if t.streak > 0 {
            lines.append("Reviews cleared \(t.streak) day\(t.streak == 1 ? "" : "s") running.")
        }
        return lines
    }
}
