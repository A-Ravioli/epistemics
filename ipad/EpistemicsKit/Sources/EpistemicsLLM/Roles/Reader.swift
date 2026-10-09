import Foundation
import EpistemicsCore

/// What the Reader may see (iPad DESIGN §5.1). There is deliberately no field for the item's reference answer,
/// rubric or misconceptions, and no initialiser taking an `Item`: a reader that knows the answer reads it into
/// ambiguous handwriting.
public struct ReaderInput: Sendable, Hashable {
    /// PNG of the rendered ink area: dark ink on a white background, upright, cropped to the area.
    public let image: Data
    /// The on-device recogniser's draft text (PencilKit / maths recogniser). May be empty.
    public let draft: String
    public let itemType: ItemType
    public let paper: Paper
    /// The question the learner was answering.
    public let prompt: String
    public var model: String?
    public var metadata: RequestMetadata?

    public init(image: Data, draft: String, itemType: ItemType, paper: Paper, prompt: String,
                model: String? = nil, metadata: RequestMetadata? = nil) {
        self.image = image; self.draft = draft; self.itemType = itemType; self.paper = paper; self.prompt = prompt
        self.model = model; self.metadata = metadata
    }
}

/// The Reader's structured transcription.
public struct ReaderOutput: Codable, Sendable, Hashable {
    public struct Node: Codable, Sendable, Hashable {
        public var id: String
        public var label: String
        public init(id: String, label: String) { self.id = id; self.label = label }
    }
    public struct Edge: Codable, Sendable, Hashable {
        public var from: String
        public var to: String
        public var label: String?
        public init(from: String, to: String, label: String? = nil) { self.from = from; self.to = to; self.label = label }
        public func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(from, forKey: .from); try c.encode(to, forKey: .to); try c.encode(label, forKey: .label)
        }
    }
    public struct Diagram: Codable, Sendable, Hashable {
        public var nodes: [Node]
        public var edges: [Edge]
        public init(nodes: [Node], edges: [Edge]) { self.nodes = nodes; self.edges = edges }
    }
    public struct Uncertain: Codable, Sendable, Hashable {
        /// The reading as it appears in `text`.
        public var span: String
        /// Other plausible readings, most likely first.
        public var alternatives: [String]
        public init(span: String, alternatives: [String]) { self.span = span; self.alternatives = alternatives }
    }

    /// Markdown, maths as `$LaTeX$`, crossed-out text excluded.
    public var text: String
    /// An answer the learner boxed / set apart, or nil.
    public var boxed: String?
    public var diagram: Diagram?
    public var crossedOut: [String]
    public var uncertain: [Uncertain]

    public init(text: String, boxed: String? = nil, diagram: Diagram? = nil, crossedOut: [String] = [], uncertain: [Uncertain] = []) {
        self.text = text; self.boxed = boxed; self.diagram = diagram; self.crossedOut = crossedOut; self.uncertain = uncertain
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encode(boxed, forKey: .boxed)
        try c.encode(diagram, forKey: .diagram)
        try c.encode(crossedOut, forKey: .crossedOut)
        try c.encode(uncertain, forKey: .uncertain)
    }

    /// True when the reading needs the learner's confirmation on its own account (doubt flagged, or a diagram).
    public var hasDoubt: Bool { !uncertain.isEmpty }
}

/// The Reader (iPad DESIGN §5.1, §13.3): Claude with vision transcribes the ink exactly, mistakes included, and
/// marks doubt instead of resolving it. One call, no samples, effort medium.
public enum Reader {
    public static let schema = JSONSchema.object([
        "text": .string,
        "boxed": .nullable(.string),
        "diagram": .nullable(.object([
            "nodes": .array(.object(["id": .string, "label": .string])),
            "edges": .array(.object(["from": .string, "to": .string, "label": .nullable(.string)])),
        ])),
        "crossedOut": .array(.string),
        "uncertain": .array(.object(["span": .string, "alternatives": .array(.string)])),
    ])

    public static func buildRequest(_ input: ReaderInput) -> LlmRequest {
        let payload = OrderedJSON.object([
            ("itemType", .string(input.itemType.rawValue)),
            ("paper", .string(input.paper.rawValue)),
            ("prompt", .string(input.prompt)),
            ("draft", .string(input.draft)),
        ])
        let text = "The image is the learner's ink. Transcribe it.\n\n" + RoleInput.encode(payload)
        return LlmRequest(role: .reader, model: input.model, system: [CacheableBlock(Prompts.reader, cache: true)],
                          messages: [.user(text, images: [.png(input.image)])], maxTokens: 8192, effort: .medium,
                          metadata: input.metadata)
    }

    /// Tidy a reading: trim, drop empty pieces, drop diagram edges to unknown nodes (an empty diagram becomes nil),
    /// keep only uncertain spans that occur in `text`, and drop alternatives equal to the span.
    public static func sanitise(_ r: ReaderOutput) -> ReaderOutput {
        let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        let text = trim(r.text)
        let boxed = r.boxed.map(trim).flatMap { $0.isEmpty ? nil : $0 }
        var diagram: ReaderOutput.Diagram?
        if let d = r.diagram {
            var seen = Set<String>()
            let nodes = d.nodes.compactMap { n -> ReaderOutput.Node? in
                let id = trim(n.id)
                guard !id.isEmpty, seen.insert(id).inserted else { return nil }
                return ReaderOutput.Node(id: id, label: trim(n.label))
            }
            let edges = d.edges.compactMap { e -> ReaderOutput.Edge? in
                let from = trim(e.from), to = trim(e.to)
                guard seen.contains(from), seen.contains(to) else { return nil }
                let label = e.label.map(trim).flatMap { $0.isEmpty ? nil : $0 }
                return ReaderOutput.Edge(from: from, to: to, label: label)
            }
            diagram = nodes.isEmpty ? nil : ReaderOutput.Diagram(nodes: nodes, edges: edges)
        }
        let crossed = r.crossedOut.map(trim).filter { !$0.isEmpty }
        let uncertain = r.uncertain.compactMap { u -> ReaderOutput.Uncertain? in
            let span = trim(u.span)
            guard !span.isEmpty, text.contains(span) else { return nil }
            let alts = TextUtil.unique(u.alternatives.map(trim).filter { !$0.isEmpty && $0 != span })
            return ReaderOutput.Uncertain(span: span, alternatives: alts)
        }
        return ReaderOutput(text: text, boxed: boxed, diagram: diagram, crossedOut: crossed, uncertain: uncertain)
    }

    public static func read(_ provider: any LLMProvider, _ input: ReaderInput) async throws -> Structured<ReaderOutput> {
        let r: Structured<ReaderOutput> = try await provider.structured(buildRequest(input), schema: schema, name: "ReaderOutput")
        return Structured(value: sanitise(r.value), usage: r.usage)
    }
}
