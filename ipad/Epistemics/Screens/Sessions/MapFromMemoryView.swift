import SwiftUI
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// Comparing a drawn map with the unit's prerequisite graph (DESIGN §6.6). Only the retrieval counts:
/// no score for layout, direction ignored, and an extra link is a question, never an error.
struct MapComparison: Equatable {
    var placed: [String: String]          // conceptId → the drawn label that named it
    var missing: [String]                 // conceptIds
    var correctEdges: [(String, String)]  // conceptId pairs
    var extraEdges: [(String, String)]    // drawn labels
    var missingEdges: [(String, String)]  // conceptId pairs
    var conceptCount: Int
    var edgeCount: Int

    static func == (a: MapComparison, b: MapComparison) -> Bool {
        a.placed == b.placed && a.missing == b.missing && a.conceptCount == b.conceptCount && a.edgeCount == b.edgeCount
    }

    static func compare(diagram: InkDiagram, concepts: [Concept], edges: [ConceptEdge]) -> MapComparison {
        let ids = Set(concepts.map(\.id))
        // Match each drawn node to at most one concept, by the onboarding matcher run on its label.
        var placed: [String: String] = [:]
        var nodeConcept: [String: String] = [:]
        let unitOnly = Curriculum.single(concepts)
        for node in diagram.nodes {
            let named = conceptsNamed(unitOnly, node.label, limit: 1)
            if let name = named.first, let c = concepts.first(where: { $0.name == name }), placed[c.id] == nil {
                placed[c.id] = node.label
                nodeConcept[node.id] = c.id
            }
        }
        let truth = Set(edges.filter { $0.kind == .prereq && ids.contains($0.from) && ids.contains($0.to) }.map { Pair($0.from, $0.to) })
        var correct: [(String, String)] = []
        var extra: [(String, String)] = []
        var seen = Set<Pair>()
        let labelOf = Dictionary(diagram.nodes.map { ($0.id, $0.label) }, uniquingKeysWith: { a, _ in a })
        for e in diagram.edges {
            guard let a = nodeConcept[e.from], let b = nodeConcept[e.to] else {
                extra.append((labelOf[e.from] ?? e.from, labelOf[e.to] ?? e.to))
                continue
            }
            let p = Pair(a, b)
            if truth.contains(p), seen.insert(p).inserted { correct.append((a, b)) }
            else if !truth.contains(p) { extra.append((labelOf[e.from] ?? a, labelOf[e.to] ?? b)) }
        }
        let missingEdges = truth.subtracting(seen).map { ($0.a, $0.b) }
        return MapComparison(placed: placed, missing: concepts.map(\.id).filter { placed[$0] == nil },
                             correctEdges: correct, extraEdges: extra, missingEdges: missingEdges,
                             conceptCount: concepts.count, edgeCount: truth.count)
    }

    /// An unordered pair of concept ids.
    private struct Pair: Hashable {
        let a: String, b: String
        init(_ x: String, _ y: String) { if x < y { a = x; b = y } else { a = y; b = x } }
    }
}

private extension Curriculum {
    /// A one-lesson curriculum wrapper, so the onboarding matcher can run on a subset of concepts.
    static func single(_ concepts: [Concept]) -> Curriculum {
        Curriculum(manifest: .init(id: "map", version: 1, parentVersion: nil, title: "", subject: "", description: "", level: "",
                                   contentHash: "", generator: .init(name: "", version: "", model: nil, promptVersion: nil), createdAt: 0, licence: nil),
                   units: [Unit(id: "u", ordinal: 0, title: "", summary: "", lessons: [Lesson(id: "l", ordinal: 0, title: "", summary: nil, concepts: concepts)])],
                   edges: [], sources: [])
    }
}

@Observable @MainActor
final class MapSessionModel {
    enum Phase: Equatable { case drawing, reading, confirming(InkReading), result, failed(String) }

    let app: AppModel
    let ctx: CourseContext
    let unit: Unit?
    let area = InkAreaModel(paper: .dotted, minHeight: 1100)
    private let reading: ReadingService
    var phase: Phase = .drawing
    var comparison: MapComparison?
    private var sessionId = ""
    private var concepts: [Concept] = []

    init(app: AppModel, ctx: CourseContext, unitId: String) {
        self.app = app
        self.ctx = ctx
        self.unit = ctx.curriculum.units.first { $0.id == unitId }
        self.reading = ReadingService(provider: ctx.provider, onDevice: app.onDevice)
    }

    private var context: ReadingContext {
        ReadingContext(itemType: .map, paper: .dotted, prompt: "Draw every idea from \(unit?.title ?? "this unit"), and how they connect.")
    }

    func inkChanged() { reading.inkChanged(area, context: context) }

    func done() async {
        guard let unit else { return }
        area.isEditable = false
        phase = .reading
        do {
            let completed = try await CourseService(ctx: ctx, store: app.store).completedLessons()
            concepts = unit.lessons.filter { completed.contains($0.id) }.flatMap(\.concepts)
            if concepts.isEmpty { concepts = unit.lessons.flatMap(\.concepts) }
            let s = Session(id: uuidv7(ctx.now()), courseId: ctx.course.id, type: .map, unitId: unit.id, startedAt: ctx.now())
            try await app.store.saveSession(s)
            sessionId = s.id
            let ink = area.record(courseId: ctx.course.id, owner: .map, ownerId: s.id, itemId: nil)
            try await app.store.saveInk(ink)
            inkId = ink.id
            let r = try await reading.read(area, inkId: ink.id, context: context)
            try await app.store.saveReading(r)
            // Maps always confirm (DESIGN §5.3): they decide what comes back tomorrow.
            phase = .confirming(r)
        } catch {
            area.isEditable = true
            phase = .failed("Couldn't read the map: \(error.localizedDescription)")
        }
    }

    private var inkId = ""

    func confirm(_ r: InkReading, text: String) async {
        var r = r
        r.confirmedText = text
        r.confirmedAt = ctx.now()
        try? await app.store.saveReading(r)
        let diagram = r.diagram ?? Self.diagram(fromLines: r.gradedText)
        let cmp = MapComparison.compare(diagram: diagram, concepts: concepts, edges: ctx.curriculum.edges)
        comparison = cmp
        area.marks = await marks(for: cmp)
        try? await app.store.saveMarks(inkId: inkId, area.marks)
        let service = CourseService(ctx: ctx, store: app.store)
        await service.setQueueFirst(Array(Set(await service.queueFirst() + cmp.missing)))
        if var s = try? await app.store.session(sessionId) {
            s.endedAt = ctx.now()
            s.summary = ["placed": .number(Double(cmp.placed.count)), "concepts": .number(Double(cmp.conceptCount)),
                         "links": .number(Double(cmp.correctEdges.count)), "edges": .number(Double(cmp.edgeCount)),
                         "missing": .array(cmp.missing.map { .string($0) })]
            try? await app.store.saveSession(s)
        }
        phase = .result
        app.didChangeLearnerState()
    }

    /// A reading with no diagram (the demo tutor): one "a -> b" per line, or bare labels.
    static func diagram(fromLines text: String) -> InkDiagram {
        var nodes: [String: InkDiagram.Node] = [:]
        var edges: [InkDiagram.Edge] = []
        func node(_ s: String) -> String {
            let label = s.trimmingCharacters(in: .whitespaces)
            let id = label.lowercased()
            if nodes[id] == nil { nodes[id] = .init(id: id, label: label) }
            return id
        }
        for line in text.split(whereSeparator: \.isNewline) {
            let parts = line.components(separatedBy: "->").flatMap { $0.components(separatedBy: "→") }.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            let ids = parts.map(node)
            for (a, b) in zip(ids, ids.dropFirst()) { edges.append(.init(from: a, to: b, label: nil)) }
        }
        return InkDiagram(nodes: Array(nodes.values), edges: edges)
    }

    private func marks(for cmp: MapComparison) async -> [InkMark] {
        var rects: [String: CGRect] = [:]
        for (conceptId, label) in cmp.placed {
            if let r = await reading.locate(label, in: area.drawing) { rects[conceptId] = r }
        }
        var marks: [InkMark] = []
        for (a, b) in cmp.correctEdges {
            guard let ra = rects[a], let rb = rects[b] else { continue }
            marks.append(InkMark(kind: .tick(CGRect(x: (ra.midX + rb.midX) / 2 - 12, y: (ra.midY + rb.midY) / 2 - 12, width: 1, height: 24))))
        }
        for (la, lb) in cmp.extraEdges.prefix(3) {
            guard let ra = await reading.locate(la, in: area.drawing), let rb = await reading.locate(lb, in: area.drawing) else { continue }
            marks.append(InkMark(kind: .query(CGRect(x: (ra.midX + rb.midX) / 2, y: (ra.midY + rb.midY) / 2, width: 1, height: 1)),
                                 note: marks.contains { if case .query = $0.kind { true } else { false } } ? nil : "Why would one need the other?"))
        }
        // Ghosts of missed ideas down the free side of the page, with dashed links to where they belong.
        let bounds = area.drawing.strokes.isEmpty ? CGRect(x: 40, y: 40, width: 300, height: 300) : area.drawing.bounds
        let x = min(bounds.maxX + 80, Theme.readingWidth + 120)
        for (i, conceptId) in cmp.missing.enumerated() {
            guard let concept = ctx.curriculum.concept(conceptId) else { continue }
            let at = CGPoint(x: x, y: bounds.minY + 60 + CGFloat(i) * 110)
            marks.append(InkMark(kind: .ghost(label: concept.name, at: at)))
            for (a, b) in cmp.missingEdges where a == conceptId || b == conceptId {
                let other = a == conceptId ? b : a
                if let r = rects[other] { marks.append(InkMark(kind: .ghostLink(from: CGPoint(x: r.maxX + 6, y: r.midY), to: CGPoint(x: at.x - 20, y: at.y)))) }
            }
        }
        return marks
    }
}

struct MapFromMemoryView: View {
    @Environment(AppModel.self) private var app
    @State private var model: MapSessionModel
    init(model: MapSessionModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(spacing: 0) {
            SessionHeader(title: "\(model.unit?.title ?? "Unit") from memory", subtitle: "Draw every idea, and how they connect",
                          closeLabel: "Close the map", onClose: { app.dismissSession() })
            if let cmp = model.comparison, model.phase == .result {
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    Text("You placed \(cmp.placed.count) of \(cmp.conceptCount) ideas and \(cmp.correctEdges.count) of \(cmp.edgeCount) links.")
                        .font(.title2x).foregroundStyle(Theme.graphite)
                    Text("The dashed blue parts are what you left out.").font(.body15).foregroundStyle(Theme.muted)
                    Spacer()
                }
                .padding(.horizontal, 42)
            }
            ScrollView([.vertical, .horizontal]) {
                HStack(alignment: .top, spacing: 0) {
                    if model.phase == .drawing, app.settings.handedness == .right { ToolTray(tools: app.tools).frame(width: 84).padding(.top, 16) }
                    InkArea(area: model.area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing)
                        .frame(width: 1100)
                        .onChange(of: model.area.revision) { model.inkChanged() }
                    if model.phase == .drawing, app.settings.handedness == .left { ToolTray(tools: app.tools).frame(width: 84).padding(.top, 16) }
                }
                .padding(20)
            }
            footer.padding(.horizontal, 42).padding(.vertical, 16)
        }
        .background(Theme.paper.ignoresSafeArea())
    }

    @ViewBuilder
    private var footer: some View {
        switch model.phase {
        case .drawing:
            HStack {
                Button("Done") { Task { await model.done() } }.buttonStyle(.primaryLarge).disabled(model.area.isEmpty)
                Text("Only the remembering counts: there is no score for neatness or layout.").font(.secondary).foregroundStyle(Theme.muted)
                Spacer()
            }
        case .reading: WorkingLine(text: "Reading your map…")
        case .confirming(let r):
            ConfirmReadingView(reading: r) { text in Task { await model.confirm(r, text: text) } }
        case .result:
            HStack(spacing: 16) {
                Button("Done") { app.dismissSession() }.buttonStyle(.primaryLarge)
                if let cmp = model.comparison, !cmp.missing.isEmpty {
                    Text(cmp.missing.compactMap { model.ctx.curriculum.concept($0)?.name }.joined(separator: ", ") + " go\(cmp.missing.count == 1 ? "es" : "") into tomorrow's reviews.")
                        .font(.body15).foregroundStyle(Theme.muted)
                }
                Spacer()
            }
        case .failed(let m): Banner(text: m, actionTitle: "Try again") { Task { await model.done() } }
        }
    }
}
