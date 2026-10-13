import Foundation

public struct WarmupConcept: Sendable, Hashable, Codable {
    public var id: String
    public var name: String
    public var definition: String
    public init(id: String, name: String, definition: String) { self.id = id; self.name = name; self.definition = definition }
}

public struct WarmupInput: Sendable, Hashable {
    /// The learner's free-recall "brain dump" (the confirmed reading of their ink).
    public var dump: String
    public var concepts: [WarmupConcept]
    public var model: String?
    public var metadata: RequestMetadata?
    public init(dump: String, concepts: [WarmupConcept], model: String? = nil, metadata: RequestMetadata? = nil) {
        self.dump = dump; self.concepts = concepts; self.model = model; self.metadata = metadata
    }
}

public struct WarmupResult: Codable, Sendable, Hashable {
    public var recalledConceptIds: [String]
    public var partial: [String]
    public init(recalledConceptIds: [String], partial: [String]) { self.recalledConceptIds = recalledConceptIds; self.partial = partial }
}

/// Warm-up grader (port of roles/warmup.ts): which listed concepts a free-recall dump shows were recalled.
/// Structured, grader-tier model at low effort.
public enum Warmup {
    public static let schema = JSONSchema.object(["recalledConceptIds": .array(.string), "partial": .array(.string)])

    public static func buildRequest(_ input: WarmupInput) -> LlmRequest {
        let payload = OrderedJSON.object([
            ("dump", .string(input.dump)),
            ("concepts", .array(input.concepts.map {
                OrderedJSON.object([("id", .string($0.id)), ("name", .string($0.name)), ("definition", .string($0.definition))])
            })),
        ])
        return LlmRequest(role: .grader, model: input.model, system: [CacheableBlock(Prompts.warmup, cache: true)],
                          messages: [.user(RoleInput.encode(payload))], maxTokens: 2048, effort: .low, metadata: input.metadata)
    }

    /// Drop unknown ids; a concept cannot be both recalled and partial (recalled wins).
    public static func sanitise(_ r: WarmupResult, concepts: [WarmupConcept]) -> WarmupResult {
        let known = Set(concepts.map(\.id))
        let recalled = TextUtil.unique(r.recalledConceptIds.filter { known.contains($0) })
        let rs = Set(recalled)
        let partial = TextUtil.unique(r.partial.filter { known.contains($0) && !rs.contains($0) })
        return WarmupResult(recalledConceptIds: recalled, partial: partial)
    }

    /// Short-circuits (no call) on an empty dump or concept list.
    public static func grade(_ provider: any LLMProvider, _ input: WarmupInput) async throws -> Structured<WarmupResult> {
        if input.concepts.isEmpty || input.dump.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return Structured(value: WarmupResult(recalledConceptIds: [], partial: []), usage: .zero)
        }
        let r: Structured<WarmupResult> = try await provider.structured(buildRequest(input), schema: schema, name: "WarmupResult")
        return Structured(value: sanitise(r.value, concepts: input.concepts), usage: r.usage)
    }
}
