import SwiftUI
import EpistemicsCore

/// The course map: units, lessons and concepts with where each one stands. One column of things said in
/// order, state in the sentence, never a chip.
struct CourseMapView: View {
    @Environment(AppModel.self) private var app
    @State private var states: [String: ConceptState] = [:]
    @State private var completed: Set<String> = []
    @State private var placedOut: Set<String> = []

    var body: some View {
        ScrollView {
            PageColumn {
                Text("Course map").font(.display).foregroundStyle(Theme.graphite)
                if let ctx = app.context {
                    ForEach(ctx.curriculum.units.sorted { $0.ordinal < $1.ordinal }) { unit in
                        VStack(alignment: .leading, spacing: 14) {
                            Text(unit.title).font(.title2x).foregroundStyle(Theme.graphite)
                            MaterialText(unit.summary, font: .readingSmall, color: Theme.muted)
                            ForEach(unit.lessons.sorted { $0.ordinal < $1.ordinal }) { lesson in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(lesson.title + (placedOut.contains(lesson.id) ? " · placed out" : completed.contains(lesson.id) ? "" : " · not yet taught"))
                                        .font(.heading).foregroundStyle(completed.contains(lesson.id) ? Theme.graphite : Theme.muted)
                                    ForEach(lesson.concepts) { concept in
                                        HStack(alignment: .firstTextBaseline) {
                                            Text(concept.name).font(.body15).foregroundStyle(Theme.graphite)
                                            Spacer()
                                            Text(status(concept, ctx: ctx)).font(.secondary).foregroundStyle(statusColor(concept))
                                        }
                                        .accessibilityElement(children: .combine)
                                    }
                                }
                                .padding(.leading, 4)
                            }
                            if completed.isSuperset(of: unit.lessons.map(\.id)) || unit.lessons.filter({ completed.contains($0.id) }).count >= 2 {
                                Button("Draw this unit from memory") { app.present(.map(unitId: unit.id)) }
                                    .buttonStyle(.ghost).padding(.leading, -16)
                            }
                        }
                        .padding(.top, 16)
                    }
                }
            }
            .padding(.top, 56).padding(.horizontal, 32).padding(.bottom, 60)
        }
        .background(Theme.paper)
        .task(id: app.revision) {
            guard let service = app.service else { return }
            try? await service.refreshAllMastery()
            states = (try? await app.store.conceptStates(course: service.course.id)) ?? [:]
            completed = (try? await service.completedLessons()) ?? []
            let placed = Set(await service.placedConcepts())
            placedOut = Set(lessonsPlacedOut(service.ctx.curriculum, knownConceptIds: placed).map(\.id))
        }
    }

    private func status(_ c: Concept, ctx: CourseContext) -> String {
        guard let s = states[c.id], s.unassistedN + s.assistedN > 0 || s.successfulSessions > 0 else { return "new" }
        if isMastered(s.mastery, unassistedPassRate(s)) { return "mastered" }
        return "\(Int((s.mastery * 100).rounded()))% · \(s.successfulSessions) of 3 spaced successes"
    }

    private func statusColor(_ c: Concept) -> Color {
        guard let s = states[c.id] else { return Theme.muted }
        return isMastered(s.mastery, unassistedPassRate(s)) ? Theme.good : Theme.muted
    }
}

/// Progress (web DESIGN §10.8): unassisted against assisted, calibration, and the cost of the tutor.
struct ProgressScreen: View {
    @Environment(AppModel.self) private var app
    @State private var stats: Stats?

    struct Stats {
        var unassisted: (pass: Int, n: Int)
        var assisted: (pass: Int, n: Int)
        var brier: Double?
        var bias: Double?
        var calibrationN: Int
        var reviewsLast7: Int
        var inkShare: Double?
        var highConfidenceErrors: [(prompt: String, when: Date)]
        var costMonth: Double
    }

    var body: some View {
        ScrollView {
            PageColumn {
                Text("Progress").font(.display).foregroundStyle(Theme.graphite)
                if let s = stats {
                    line("Without help", rate(s.unassisted), "Lessons' unaided checks, reviews and checkpoints. Only these count towards mastery.")
                    line("With hints showing", rate(s.assisted), "A widening gap between these two lines means the tutor is doing the work.")
                    if let brier = s.brier, let bias = s.bias {
                        line("Calibration", String(format: "Brier %.2f over %d answers", brier, s.calibrationN),
                             bias > 0.05 ? "You tend to be more sure than you are right." : bias < -0.05 ? "You tend to be right more often than you say." : "Your confidence matches how often you're right.")
                    }
                    line("Reviews this week", "\(s.reviewsLast7)", nil)
                    if let share = s.inkShare {
                        line("Answered by hand", "\(Int((share * 100).rounded()))%", nil)
                    }
                    if !s.highConfidenceErrors.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Worth your attention").font(.heading).foregroundStyle(Theme.graphite)
                            Text("Answers you were certain of and got wrong. These are the most fixable errors there are.")
                                .font(.secondary).foregroundStyle(Theme.muted)
                            ForEach(Array(s.highConfidenceErrors.prefix(6).enumerated()), id: \.offset) { _, e in
                                MaterialText(e.prompt, font: .readingSmall)
                            }
                        }
                        .padding(.top, 10)
                    }
                    line("Claude this month", String(format: "$%.2f", s.costMonth), nil)
                } else {
                    WorkingLine(text: "Adding it up…")
                }
            }
            .padding(.top, 56).padding(.horizontal, 32).padding(.bottom, 60)
        }
        .background(Theme.paper)
        .task(id: app.revision) { await load() }
    }

    private func rate(_ x: (pass: Int, n: Int)) -> String {
        x.n == 0 ? "nothing yet" : "\(Int((Double(x.pass) / Double(x.n) * 100).rounded()))% of \(x.n)"
    }

    private func line(_ title: String, _ value: String, _ note: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.heading).foregroundStyle(Theme.graphite)
                Spacer()
                Text(value).font(.body15).foregroundStyle(Theme.graphite)
            }
            if let note { Text(note).font(.secondary).foregroundStyle(Theme.muted) }
        }
        .padding(.top, 6)
    }

    private func load() async {
        guard let ctx = app.context else { return }
        let receipts = (try? await app.store.receipts(course: ctx.course.id)) ?? []
        let unaided = receipts.filter { !$0.assisted }
        let aided = receipts.filter(\.assisted)
        let pairs = unaided.suffix(200).compactMap { r in r.confidence.map { CalibrationPair(confidence: $0, correct: r.rating.rawValue >= 3) } }
        let brier = pairs.isEmpty ? nil : brierScore(pairs)
        let week = (try? await app.store.reviewLog(course: ctx.course.id, since: AppModel.now() - 7 * 86_400_000)) ?? []
        let modal = receipts.compactMap(\.modality)
        let errors = unaided.filter { $0.confidence == .certain && $0.rating == .again }.suffix(6).reversed()
            .map { (ctx.curriculum.item($0.itemId)?.prompt ?? $0.itemId, Date(timeIntervalSince1970: Double($0.createdAt) / 1000)) }
        let cost = (try? await app.store.llmCost(since: AppModel.now() - 30 * 86_400_000)) ?? 0
        stats = Stats(unassisted: (unaided.filter { $0.rating.rawValue >= 3 }.count, unaided.count),
                      assisted: (aided.filter { $0.rating.rawValue >= 3 }.count, aided.count),
                      brier: brier?.brier, bias: brier?.overconfidenceBias, calibrationN: pairs.count,
                      reviewsLast7: week.filter { $0.source == .review }.count,
                      inkShare: modal.isEmpty ? nil : Double(modal.filter { $0 == .ink }.count) / Double(modal.count),
                      highConfidenceErrors: errors, costMonth: cost)
    }
}
