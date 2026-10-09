// Map from memory (iPad DESIGN §6.6): compare a drawn concept map with the unit's concepts and prerequisite
// graph. The Reader supplies the node labels and the drawn links; this is the deterministic part.
//
// Nodes are matched to concepts with the first-run matcher (a label names a concept when it contains the
// full name or every distinctive word of it), loosened for handwriting: possessives and plural "s" are
// ignored. Links are compared ignoring direction (v1). Only the retrieval counts: there is no layout score.

public struct DrawnEdge: Codable, Sendable, Hashable {
    public var from: String
    public var to: String
    public init(_ from: String, _ to: String) { self.from = from; self.to = to }
}

/// An undirected pair of concept ids, stored in code-unit order.
public struct ConceptPair: Codable, Sendable, Hashable {
    public var a: String
    public var b: String
    public init(_ x: String, _ y: String) {
        if jsCompareCodeUnits(x, y) <= 0 { a = x; b = y } else { a = y; b = x }
    }
}

public struct MapGrade: Codable, Sendable, Hashable {
    /// Unit concepts at least one node was matched to, in unit order.
    public var placed: [String]
    /// Unit concepts no node matched, in unit order. Their items go to the front of tomorrow's queue.
    public var missing: [String]
    /// Node label → concept id, for labels that matched.
    public var nodeMatches: [String: String]
    /// Labels that matched no unit concept (shown as written; never marked wrong).
    public var unmatchedNodes: [String]
    /// Drawn links that are prerequisite edges of the unit (blue ticks).
    public var correctEdges: [ConceptPair]
    /// Drawn links that are not in the graph, or whose ends did not match two different concepts (blue "?").
    public var extraEdges: [DrawnEdge]
    /// Prerequisite edges of the unit that were not drawn (dashed ghosts).
    public var missingEdges: [ConceptPair]
    public var conceptCount: Int
    public var edgeCount: Int

    /// "You placed 6 of 7 ideas and 4 of 7 links."
    public var summary: String {
        "You placed \(placed.count) of \(conceptCount) ideas and \(correctEdges.count) of \(edgeCount) links."
    }
}

/// Lowercase word with possessive and plural endings removed, for matching handwriting to names.
func normalizedMapWord(_ w: String) -> String {
    var s = w
    if s.hasSuffix("'s") { s.removeLast(2) }
    while s.hasSuffix("'") || s.hasSuffix("-") { s.removeLast() }
    if s.count > 3 && s.hasSuffix("s") && !s.hasSuffix("ss") { s.removeLast() }
    return s
}

/// How specifically `label` names `concept`: nil when it does not, else the number of distinctive words
/// matched (a full-name match counts as all of them, plus one).
func mapMatchScore(_ label: String, _ conceptName: String) -> Int? {
    let text = label.lowercased()
    let bag = Set(matchWords(text))
    let distinctive = distinctiveWords(conceptName)
    if jsIncludes(text, conceptName.lowercased()) { return distinctive.count + 1 }
    if namesConcept(text, bag, conceptName) { return distinctive.count }
    let loose = Set(bag.map(normalizedMapWord))
    let wanted = distinctive.map(normalizedMapWord)
    if !wanted.isEmpty && wanted.allSatisfy(loose.contains) { return wanted.count }
    return nil
}

/// Matches one label to the unit concept it names most specifically (ties: earliest in the unit).
public func matchMapNode(_ label: String, _ concepts: [Concept]) -> Concept? {
    var best: (Concept, Int)?
    for c in concepts {
        if let score = mapMatchScore(label, c.name), score > (best?.1 ?? 0) { best = (c, score) }
    }
    return best?.0
}

/// Grades a drawn map against `unit`. `edges` are the curriculum's edges; only prerequisite edges with both
/// ends inside the unit count.
public func gradeMap(nodes: [String], edges drawn: [DrawnEdge], unit: Unit, curriculumEdges: [ConceptEdge]) -> MapGrade {
    let concepts = unit.lessons.flatMap(\.concepts)
    let ids = Set(concepts.map(\.id))

    var nodeMatches: [String: String] = [:]
    var unmatched: [String] = []
    for label in nodes {
        if let c = matchMapNode(label, concepts) { nodeMatches[label] = c.id } else if !unmatched.contains(label) { unmatched.append(label) }
    }
    let placedSet = Set(nodeMatches.values)

    var expected: [ConceptPair] = []
    for e in curriculumEdges where e.kind == .prereq && ids.contains(e.from) && ids.contains(e.to) && e.from != e.to {
        let p = ConceptPair(e.from, e.to)
        if !expected.contains(p) { expected.append(p) }
    }
    let expectedSet = Set(expected)

    var correct: [ConceptPair] = []
    var extra: [DrawnEdge] = []
    for e in drawn {
        guard let a = nodeMatches[e.from] ?? matchMapNode(e.from, concepts)?.id,
              let b = nodeMatches[e.to] ?? matchMapNode(e.to, concepts)?.id, a != b else {
            extra.append(e)
            continue
        }
        let p = ConceptPair(a, b)
        if expectedSet.contains(p) {
            if !correct.contains(p) { correct.append(p) }
        } else {
            extra.append(e)
        }
    }

    return MapGrade(
        placed: concepts.map(\.id).filter(placedSet.contains),
        missing: concepts.map(\.id).filter { !placedSet.contains($0) },
        nodeMatches: nodeMatches,
        unmatchedNodes: unmatched,
        correctEdges: correct,
        extraEdges: extra,
        missingEdges: expected.filter { !correct.contains($0) },
        conceptCount: concepts.count,
        edgeCount: expected.count)
}
