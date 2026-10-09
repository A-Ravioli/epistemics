import Foundation

// Adaptive placement over the prerequisite graph, in the style of knowledge-space assessment (ALEKS), for
// the iPad's first run (ipad/docs/DESIGN.md §6.1).
//
// The web diagnostic (Diagnostic.swift) binary-searches a single depth for the whole course, which misplaces
// a learner who knows one branch (counting) and not another (conditional probability). This one reasons per
// concept, in both directions:
//
//   pass on c  ⇒ c and every prerequisite of c (transitively) are known
//   fail on c  ⇒ c and every concept that depends on c (transitively) are not known
//
// Each probe goes to the undetermined concept whose answer settles the most concepts in the worse case
// (max of min(undetermined ancestors, undetermined descendants)), so a few questions place a whole course.
// It stops when every concept is settled or after `maxProbes`. Anything still unsettled counts as not known:
// placement only ever skips teaching, it never invents mastery, and every placed concept still has to
// survive its reviews (provisional cards, DESIGN §6.4).

public let PLACEMENT_DEFAULT_MAX_PROBES = 12

public struct PlacementState: Codable, Sendable, Hashable {
    /// Concept ids in curriculum order (unit → lesson → concept).
    public var conceptIds: [String]
    /// Direct prerequisites per concept.
    public var prereqs: [String: [String]]
    /// Direct dependents per concept.
    public var dependents: [String: [String]]
    /// The item each concept is probed with (prefers apply/explain). Concepts without items are absent.
    public var probeItem: [String: String]
    /// Answers actually given, by concept.
    public var answered: [String: Bool]
    /// Concepts settled as known (answered or inferred).
    public var known: Set<String>
    /// Concepts settled as not known (answered or inferred).
    public var unknown: Set<String>
    public var probes: Int
    public var maxProbes: Int

    public var done: Bool { nextPlacementProbe(self) == nil }
    /// Questions probably still to come, for the progress line (an estimate, never a promise).
    public var estimatedRemaining: Int {
        let open = conceptIds.filter { !known.contains($0) && !unknown.contains($0) && probeItem[$0] != nil }.count
        guard open > 0 else { return 0 }
        return min(maxProbes - probes, Int((log2(Double(open + 1))).rounded(.up)))
    }
}

public struct PlacementProbe: Codable, Sendable, Hashable {
    public var conceptId: String
    public var itemId: String
}

public struct PlacementResult: Codable, Sendable, Hashable {
    /// Settled as known, in curriculum order.
    public var knownConceptIds: [String]
    /// Everything else (settled unknown or never reached), in curriculum order.
    public var notKnownConceptIds: [String]
    public var probes: Int
    public init(knownConceptIds: [String], notKnownConceptIds: [String], probes: Int) {
        self.knownConceptIds = knownConceptIds; self.notKnownConceptIds = notKnownConceptIds; self.probes = probes
    }
}

public func createPlacement(_ curriculum: Curriculum, maxProbes: Int = PLACEMENT_DEFAULT_MAX_PROBES) -> PlacementState {
    let concepts = curriculum.units.sorted { $0.ordinal < $1.ordinal }
        .flatMap { $0.lessons.sorted { $0.ordinal < $1.ordinal }.flatMap(\.concepts) }
    let ids = concepts.map(\.id)
    let idSet = Set(ids)
    var prereqs: [String: [String]] = Dictionary(uniqueKeysWithValues: ids.map { ($0, []) })
    var dependents = prereqs
    for e in curriculum.edges where e.kind == .prereq && idSet.contains(e.from) && idSet.contains(e.to) && e.from != e.to {
        prereqs[e.to, default: []].append(e.from)
        dependents[e.from, default: []].append(e.to)
    }
    var probeItem: [String: String] = [:]
    for c in concepts {
        if let item = placementProbeItem(c.items) { probeItem[c.id] = item.id }
    }
    return PlacementState(conceptIds: ids, prereqs: prereqs, dependents: dependents, probeItem: probeItem, answered: [:],
                          known: [], unknown: [], probes: 0, maxProbes: maxProbes)
}

/// Items that show the concept can be used, not just recognised: apply and explain first.
private let PLACEMENT_TYPE_PREF: [ItemType: Int] = [.apply: 0, .explain: 0, .sketch: 1, .discriminate: 1, .predict: 2,
                                                    .recall: 3, .cloze: 3, .map: 4, .teachback: 5]

func placementProbeItem(_ items: [Item]) -> Item? {
    items.min { (PLACEMENT_TYPE_PREF[$0.type] ?? 2) < (PLACEMENT_TYPE_PREF[$1.type] ?? 2) }
}

/// Every concept reachable from `start` along `edges` (excluding `start`).
private func closure(_ start: String, _ edges: [String: [String]]) -> Set<String> {
    var seen = Set<String>()
    var stack = edges[start] ?? []
    while let next = stack.popLast() {
        if seen.insert(next).inserted { stack.append(contentsOf: edges[next] ?? []) }
    }
    seen.remove(start)
    return seen
}

/// The next concept to ask about, or nil when placement is finished.
public func nextPlacementProbe(_ state: PlacementState) -> PlacementProbe? {
    guard state.probes < state.maxProbes else { return nil }
    let settled = state.known.union(state.unknown)
    var best: (score: Int, index: Int, id: String)?
    for (index, id) in state.conceptIds.enumerated() where !settled.contains(id) && state.probeItem[id] != nil {
        let up = closure(id, state.prereqs).subtracting(settled).count + 1
        let down = closure(id, state.dependents).subtracting(settled).count + 1
        let score = min(up, down)
        // Highest worst-case gain; ties go to the earlier concept, so the test reads in course order.
        if best == nil || score > best!.score { best = (score, index, id) }
    }
    return best.map { PlacementProbe(conceptId: $0.id, itemId: state.probeItem[$0.id]!) }
}

public func recordPlacementResult(_ state: PlacementState, _ conceptId: String, _ passed: Bool) -> PlacementState {
    guard state.conceptIds.contains(conceptId), state.answered[conceptId] == nil else { return state }
    var s = state
    s.answered[conceptId] = passed
    s.probes += 1
    if passed {
        let gained = closure(conceptId, s.prereqs).union([conceptId]).subtracting(s.unknown)
        s.known.formUnion(gained)
    } else {
        let lost = closure(conceptId, s.dependents).union([conceptId]).subtracting(s.known)
        s.unknown.formUnion(lost)
    }
    return s
}

public func placementResult(_ state: PlacementState) -> PlacementResult {
    PlacementResult(knownConceptIds: state.conceptIds.filter { state.known.contains($0) },
                    notKnownConceptIds: state.conceptIds.filter { !state.known.contains($0) },
                    probes: state.probes)
}

/// Lessons every one of whose concepts is known: placement skips teaching them.
public func lessonsPlacedOut(_ curriculum: Curriculum, knownConceptIds: Set<String>) -> [Lesson] {
    curriculum.allLessons.filter { !$0.concepts.isEmpty && $0.concepts.allSatisfy { knownConceptIds.contains($0.id) } }
}
