// Adaptive diagnostic placement over the prerequisite DAG (web DESIGN §6.4; diagnostic.ts).
//
// Depth of a concept = length of its longest prerequisite chain. Probing starts at the median depth, moves
// deeper on a pass and shallower on a fail (binary search over depth levels), and stops when the frontier
// is bracketed within one level or after `DIAGNOSTIC_MAX_PROBES` probes.

public let DIAGNOSTIC_MAX_PROBES = 25

public struct DiagnosticState: Codable, Sendable, Hashable {
    /// Concept ids in curriculum order (unit → lesson → concept).
    public var conceptIds: [String]
    public var depth: [String: Int]
    public var maxDepth: Int
    /// Chosen probe item per concept (prefers apply/explain). Concepts without items are absent.
    public var probeItem: [String: String]
    public var results: [String: Bool]
    /// Highest depth with a pass so far; -1 before any pass.
    public var lo: Int
    /// Lowest depth with a fail so far; maxDepth + 1 before any fail.
    public var hi: Int
    public var probeDepth: Int
    public var probes: Int
    public var done: Bool
}

public struct DiagnosticProbe: Codable, Sendable, Hashable {
    public var conceptId: String
    public var itemId: String
    public var depth: Int
}

public struct DiagnosticResult: Codable, Sendable, Hashable {
    public var knownConceptIds: [String]
    public var frontierDepth: Int
    public var probes: Int
}

private func allConceptIds(_ curriculum: Curriculum) -> [String] {
    curriculum.units.flatMap { $0.lessons.flatMap { $0.concepts.map(\.id) } }
}

/// Longest prerequisite chain per concept over `prereq` edges (cycles are broken by ignoring back-edges).
public func conceptDepths(_ curriculum: Curriculum) -> [String: Int] {
    let ids = allConceptIds(curriculum)
    let idSet = Set(ids)
    var prereqs: [String: [String]] = [:]
    for id in ids { prereqs[id] = [] }
    for e in curriculum.edges where e.kind == .prereq && idSet.contains(e.from) && idSet.contains(e.to) {
        prereqs[e.to]?.append(e.from)
    }
    var depth: [String: Int] = [:]
    var visiting = Set<String>()
    func visit(_ id: String) -> Int {
        if let known = depth[id] { return known }
        if visiting.contains(id) { return 0 } // cycle guard
        visiting.insert(id)
        var d = 0
        for p in prereqs[id] ?? [] { d = max(d, visit(p) + 1) }
        visiting.remove(id)
        depth[id] = d
        return d
    }
    for id in ids { _ = visit(id) }
    return depth
}

private let PROBE_TYPE_PREF: [ItemType: Int] = [.apply: 0, .explain: 0, .discriminate: 1, .map: 1, .predict: 2, .recall: 3, .cloze: 3, .teachback: 4]

private func pickProbeItem(_ items: [Item]) -> Item? {
    var best: Item?
    var bestKey = Int.max
    for item in items {
        let key = PROBE_TYPE_PREF[item.type] ?? 2
        if key < bestKey { best = item; bestKey = key }
    }
    return best
}

public func createDiagnostic(_ curriculum: Curriculum) -> DiagnosticState {
    let depth = conceptDepths(curriculum)
    let conceptIds = allConceptIds(curriculum)
    var probeItem: [String: String] = [:]
    for c in curriculum.units.flatMap({ $0.lessons.flatMap(\.concepts) }) {
        if let item = pickProbeItem(c.items) { probeItem[c.id] = item.id }
    }
    let depths = conceptIds.map { depth[$0] ?? 0 }.sorted()
    let maxDepth = depths.last ?? 0
    let median = depths.isEmpty ? 0 : depths[(depths.count - 1) / 2]
    return DiagnosticState(conceptIds: conceptIds, depth: depth, maxDepth: maxDepth, probeItem: probeItem, results: [:],
                           lo: -1, hi: maxDepth + 1, probeDepth: median, probes: 0,
                           done: conceptIds.isEmpty || probeItem.isEmpty)
}

private func bracketed(_ s: DiagnosticState) -> Bool { s.hi - s.lo <= 1 }

private func unprobedAt(_ s: DiagnosticState, _ d: Int) -> String? {
    s.conceptIds.first { s.depth[$0] == d && s.results[$0] == nil && s.probeItem[$0] != nil }
}

/// Next concept and item to probe, or nil when the diagnostic is finished.
public func nextProbe(_ state: DiagnosticState) -> DiagnosticProbe? {
    if state.done || state.probes >= DIAGNOSTIC_MAX_PROBES || bracketed(state) { return nil }
    // Prefer the target depth, then the nearest depths strictly inside the open bracket (lo, hi).
    var candidates: [Int] = []
    let minD = max(0, state.lo + 1)
    let maxD = min(state.maxDepth, state.hi - 1)
    let target = max(minD, min(maxD, state.probeDepth))
    for delta in 0...max(0, state.maxDepth) {
        if target + delta <= maxD { candidates.append(target + delta) }
        if delta > 0 && target - delta >= minD { candidates.append(target - delta) }
    }
    for d in candidates {
        if let conceptId = unprobedAt(state, d) { return DiagnosticProbe(conceptId: conceptId, itemId: state.probeItem[conceptId]!, depth: d) }
    }
    return nil
}

public func recordResult(_ state: DiagnosticState, _ conceptId: String, _ passed: Bool) -> DiagnosticState {
    if state.done { return state }
    guard let d = state.depth[conceptId], state.results[conceptId] == nil else { return state }
    var s = state
    s.results[conceptId] = passed
    s.probes += 1
    if passed { s.lo = max(s.lo, d) } else { s.hi = min(s.hi, d) }
    if s.hi <= s.lo {
        // Inconsistent evidence (pass above a fail): trust the most recent probe.
        if passed { s.hi = s.lo + 1 } else { s.lo = s.hi - 1 }
    }
    s.probeDepth = floorDiv(s.lo + s.hi, 2)
    var open = s
    open.done = false
    s.done = s.probes >= DIAGNOSTIC_MAX_PROBES || bracketed(s) || nextProbe(open) == nil
    return s
}

/// Concepts at depths below the frontier plus every concept that was directly passed.
public func diagnosticResult(_ state: DiagnosticState) -> DiagnosticResult {
    let frontierDepth = state.lo + 1
    let known = state.conceptIds.filter { id in
        let d = state.depth[id] ?? 0
        return state.results[id] == true || (d < frontierDepth && state.results[id] != false)
    }
    return DiagnosticResult(knownConceptIds: known, frontierDepth: frontierDepth, probes: state.probes)
}
