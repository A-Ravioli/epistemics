import SwiftUI
import PencilKit
import EpistemicsCore

/// The notebook (DESIGN §6.8): every page you have written, as a record. It is unreachable during any
/// session, because sessions cover the whole screen, so it can never hold an answer to a question being asked.
struct NotebookView: View {
    @Environment(AppModel.self) private var app
    @State private var pages: [NotebookPage] = []
    @State private var loaded = false

    struct NotebookPage: Identifiable {
        var id: String
        var title: String
        var date: Date
        var entries: [(ink: InkRecord, drawing: PKDrawing, marks: [InkMark], label: String?)]
    }

    var body: some View {
        ScrollView {
            PageColumn {
                Text("Notebook").font(.display).foregroundStyle(Theme.graphite)
                Text("Everything you have written, kept as you wrote it. It's a record, not a study guide: re-reading feels like learning and isn't. To find out what you still know, answer the questions instead.")
                    .font(.body15).foregroundStyle(Theme.muted)
                if loaded && pages.isEmpty {
                    PageNote(text: "Nothing written yet.")
                }
                ForEach(pages) { page in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(page.title).font(.heading).foregroundStyle(Theme.graphite)
                            Spacer()
                            Text(page.date.formatted(date: .abbreviated, time: .shortened)).font(.secondary).foregroundStyle(Theme.muted)
                        }
                        ForEach(page.entries, id: \.ink.id) { entry in
                            VStack(alignment: .leading, spacing: 6) {
                                if let label = entry.label { MaterialText(label, font: .readingSmall, color: Theme.muted) }
                                InkSnapshot(drawing: entry.drawing, paper: entry.ink.paper, marks: entry.marks, maxHeight: 260)
                                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.sheet))
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    }
                    .padding(.top, 18)
                }
            }
            .padding(.top, 56).padding(.horizontal, 32).padding(.bottom, 60)
        }
        .background(Theme.paper)
        .task(id: app.revision) { await load() }
    }

    private func load() async {
        guard let ctx = app.context else { return }
        let inks = (try? await app.store.ink(course: ctx.course.id)) ?? []
        var sessions: [String: Session] = [:]
        for s in (try? await app.store.sessions(course: ctx.course.id)) ?? [] { sessions[s.id] = s }
        var byOwner: [String: [InkRecord]] = [:]
        var order: [String] = []
        for ink in inks.reversed() {
            if byOwner[ink.ownerId] == nil { order.append(ink.ownerId) }
            byOwner[ink.ownerId, default: []].append(ink)
        }
        var out: [NotebookPage] = []
        for owner in order.prefix(60) {
            let list = (byOwner[owner] ?? []).sorted { $0.createdAt < $1.createdAt }
            guard let first = list.first else { continue }
            var entries: [(InkRecord, PKDrawing, [InkMark], String?)] = []
            for ink in list {
                guard let d = try? PKDrawing(data: ink.drawing), !d.strokes.isEmpty else { continue }
                let marks = (try? await app.store.marks(inkId: ink.id)) ?? []
                let label = ink.itemId.flatMap { ctx.curriculum.item($0)?.prompt }
                entries.append((ink, d, marks, label))
            }
            guard !entries.isEmpty else { continue }
            out.append(NotebookPage(id: owner, title: title(first, session: sessions[owner], ctx: ctx),
                                    date: Date(timeIntervalSince1970: Double(first.createdAt) / 1000), entries: entries))
        }
        pages = out
        loaded = true
    }

    private func title(_ ink: InkRecord, session: Session?, ctx: CourseContext) -> String {
        switch ink.ownerKind {
        case .firstRun: return "What you knew on day one"
        case .placement: return "Placement"
        case .warmup: return "Warm-up" + (session?.lessonId.flatMap { ctx.curriculum.lesson($0)?.title }.map { ": \($0)" } ?? "")
        case .review: return "Reviews"
        case .lessonTurn, .lessonSummary:
            return session?.lessonId.flatMap { ctx.curriculum.lesson($0)?.title } ?? "Lesson"
        case .checkpoint: return "Checkpoint" + (session?.unitId.flatMap { id in ctx.curriculum.units.first { $0.id == id }?.title }.map { ": \($0)" } ?? "")
        case .map: return "Map from memory" + (session?.unitId.flatMap { id in ctx.curriculum.units.first { $0.id == id }?.title }.map { ": \($0)" } ?? "")
        case .teachback: return "Teach-back"
        }
    }
}
