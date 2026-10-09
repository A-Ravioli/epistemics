import Foundation
import PencilKit
import EpistemicsCore
import EpistemicsLLM

/// What the Reader is told about an ink area: never the answer key (DESIGN §5.1, rule 1 of §15).
struct ReadingContext: Sendable {
    var itemType: ItemType
    var paper: Paper
    var prompt: String
    var metadata: RequestMetadata?
}

/// The ink → text pipeline (DESIGN §5.1–5.2): on-device draft, then the Reader, with speculative reads
/// while the Pencil rests so the reading is usually done by the time the learner hands in.
@MainActor
final class ReadingService {
    private let provider: any LLMProvider
    private let onDevice: OnDeviceReader
    private var speculative: [String: (revision: Int, task: Task<InkReading, Error>)] = [:]
    private var idleTimers: [String: Task<Void, Never>] = [:]

    init(provider: any LLMProvider, onDevice: OnDeviceReader) {
        self.provider = provider
        self.onDevice = onDevice
    }

    /// Short self-graded answers are read on device only; everything else goes through the Reader.
    static func usesReader(_ ctx: ReadingContext) -> Bool {
        !(ctx.paper == .short && (ctx.itemType == .recall || ctx.itemType == .cloze))
    }

    /// Call on every drawing change: after two seconds of rest, start reading in the background.
    func inkChanged(_ area: InkAreaModel, context: ReadingContext) {
        idleTimers[area.id]?.cancel()
        guard !area.isEmpty else { return }
        let revision = area.revision
        idleTimers[area.id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled, let self, area.revision == revision else { return }
            self.startRead(area, context: context)
        }
    }

    /// The reading for the ink as it is now, reusing a speculative read when nothing changed since.
    func read(_ area: InkAreaModel, inkId: String, context: ReadingContext) async throws -> InkReading {
        idleTimers[area.id]?.cancel()
        if let s = speculative[area.id], s.revision == area.revision {
            var r = try await s.task.value
            r.inkId = inkId
            return r
        }
        startRead(area, context: context)
        var r = try await speculative[area.id]!.task.value
        r.inkId = inkId
        return r
    }

    private func startRead(_ area: InkAreaModel, context: ReadingContext) {
        speculative[area.id]?.task.cancel()
        let drawing = area.drawing
        let provider = provider
        let onDevice = onDevice
        let task = Task<InkReading, Error> {
            try await Self.readNow(drawing: drawing, context: context, provider: provider, onDevice: onDevice)
        }
        speculative[area.id] = (area.revision, task)
    }

    nonisolated static func readNow(drawing: PKDrawing, context: ReadingContext, provider: any LLMProvider,
                                    onDevice: OnDeviceReader) async throws -> InkReading {
        let now = AppModel.now()
        let draft = await onDevice.read(drawing)
        guard usesReader(context), let png = await MainActor.run(body: { InkRenderer.png(drawing) }) else {
            return InkReading(id: uuidv7(now: now), inkId: "", source: .onDevice, model: nil, text: draft, boxed: nil, diagram: nil,
                              crossedOut: [], uncertain: [], draft: draft, createdAt: now)
        }
        let out = try await Reader.read(provider, ReaderInput(image: png, draft: draft, itemType: context.itemType,
                                                              paper: context.paper, prompt: context.prompt, metadata: context.metadata))
        let r = out.value
        return InkReading(id: uuidv7(now: now), inkId: "", source: provider.name == "mock" ? .demo : .reader, model: out.usage.model,
                          text: r.text, boxed: r.boxed,
                          diagram: r.diagram.map { d in InkDiagram(nodes: d.nodes.map { .init(id: $0.id, label: $0.label) },
                                                                    edges: d.edges.map { .init(from: $0.from, to: $0.to, label: $0.label) }) },
                          crossedOut: r.crossedOut, uncertain: r.uncertain.map { UncertainSpan(span: $0.span, alternatives: $0.alternatives) },
                          draft: draft, createdAt: now)
    }

    /// Where a quote from the reading was written, for placing a mark (DESIGN §5.5).
    func locate(_ quote: String, in drawing: PKDrawing) async -> CGRect? {
        await onDevice.locate(quote, in: drawing)
    }
}

extension InkAreaModel {
    /// A storable record of this ink area.
    func record(courseId: String, owner: InkOwner, ownerId: String, itemId: String?, id: String = uuidv7(now: AppModel.now())) -> InkRecord {
        let now = AppModel.now()
        return InkRecord(id: id, courseId: courseId, ownerKind: owner, ownerId: ownerId, itemId: itemId, paper: paper,
                         drawing: drawing.dataRepresentation(), width: Theme.readingWidth, height: height,
                         strokeCount: drawing.strokes.count, writingMs: writingMs, firstStrokeMs: firstStrokeMs,
                         createdAt: now, updatedAt: now)
    }
}
