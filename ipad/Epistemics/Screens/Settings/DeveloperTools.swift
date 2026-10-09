import SwiftUI
import PencilKit
import EpistemicsCore

/// Debug builds only: lets the app's clock run ahead, so spaced reviews can be seen without waiting.
enum DeveloperClock {
    #if DEBUG
    nonisolated(unsafe) static var offsetMs = UserDefaults.standard.integer(forKey: "developerClockOffsetMs")
    static func advance(days: Double) {
        offsetMs += Int(days * 86_400_000)
        UserDefaults.standard.set(offsetMs, forKey: "developerClockOffsetMs")
    }
    static func reset() {
        offsetMs = 0
        UserDefaults.standard.set(0, forKey: "developerClockOffsetMs")
    }
    #else
    static let offsetMs = 0
    #endif
}

#if DEBUG
/// Settings → Developer (debug builds): clock and a demo-tutor autopilot for the next lesson.
struct DeveloperTools: View {
    @Environment(AppModel.self) private var app
    @State private var status: String?
    @State private var running = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Developer").font(.heading).foregroundStyle(Theme.graphite)
            Text(DeveloperClock.offsetMs == 0 ? "The app's clock is real time."
                 : String(format: "The app's clock is %.1f days ahead.", Double(DeveloperClock.offsetMs) / 86_400_000))
                .font(.secondary).foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                Button("Skip ahead a day") { DeveloperClock.advance(days: 1); app.didChangeLearnerState(); status = nil }
                    .buttonStyle(.secondary)
                Button("Back to real time") { DeveloperClock.reset(); app.didChangeLearnerState(); status = nil }
                    .buttonStyle(.secondary)
            }
            Button(running ? "Writing the lesson…" : "Finish the next lesson with scribbles") { Task { await autopilot() } }
                .buttonStyle(.secondary)
                .disabled(running || app.context == nil)
            if let unit = app.context?.curriculum.units.first {
                HStack(spacing: 10) {
                    Button("Open \(unit.title)'s checkpoint") { app.present(.checkpoint(unitId: unit.id)) }.buttonStyle(.secondary)
                    Button("Draw it from memory") { app.present(.map(unitId: unit.id)) }.buttonStyle(.secondary)
                }
            }
            if let status { Text(status).font(.secondary).foregroundStyle(Theme.muted) }
        }
        .padding(.top, 12)
    }

    /// Answers every prompt of the next lesson with a scribble, as the end-to-end tests do.
    private func autopilot() async {
        guard let ctx = app.context, let service = app.service else { return }
        running = true
        defer { running = false }
        let completed = (try? await service.completedLessons()) ?? []
        guard let lesson = ctx.curriculum.allLessons.first(where: { !completed.contains($0.id) }) else {
            status = "Every lesson is done."; return
        }
        let model = LessonSessionModel(app: app, ctx: ctx, lessonId: lesson.id)
        await model.start()
        for step in 0..<400 {
            if let e = model.error { status = "Stopped: \(e)"; return }
            if let p = model.pendingConfirmation { await model.confirmPending(text: p.reading.text); continue }
            switch model.inputMode {
            case .done:
                status = "Finished \(lesson.title)."
                app.didChangeLearnerState()
                return
            case .jol:
                await model.submitJol(Dictionary(uniqueKeysWithValues: lesson.concepts.map { ($0.id, 0.5) }))
            case .answer, .summary:
                model.activeArea.drawing = Self.scribble(step); await model.handIn()
            case .answerConfidence:
                model.activeArea.drawing = Self.scribble(step); await model.handIn(confidence: .fairlySure)
            }
        }
        status = "Gave up after 400 steps."
    }

    static func scribble(_ seed: Int) -> PKDrawing {
        let start = Date()
        func stroke(_ pts: [CGPoint]) -> PKStroke {
            PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: pts.enumerated().map { i, p in
                PKStrokePoint(location: p, timeOffset: Double(i) * 0.016, size: CGSize(width: 3, height: 3), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
            }, creationDate: start))
        }
        let x = CGFloat(40 + (seed % 5) * 30)
        return PKDrawing(strokes: [stroke([CGPoint(x: x, y: 30), CGPoint(x: x, y: 90)]),
                                   stroke([CGPoint(x: x + 20, y: 95), CGPoint(x: x + 50, y: 25)])])
    }
}
#endif
