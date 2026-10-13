// iPad additions: the paper an answer is written on, and how long an answer takes by hand.

// MARK: - Paper (iPad DESIGN §3, §7)

/// The ink area an item starts with. It grows as the learner writes; `lines` is only the starting size
/// (for squared paper, rows; for dotted, roughly lines of a screen).
public struct InkLayout: Codable, Sendable, Hashable {
    public var paper: Paper
    public var lines: Int
    /// 2 for `discriminate`: two columns headed by the two concepts.
    public var columns: Int
    public init(paper: Paper, lines: Int, columns: Int = 1) { self.paper = paper; self.lines = lines; self.columns = columns }

    /// Dialogue turns, PROBE, CONSOLIDATE, the lesson summary: ruled, 3 lines.
    public static let dialogue = InkLayout(paper: .ruled, lines: INK_RULED_LINES)
    /// The warm-up brain dump and the first-run recall: dotted, most of a screen.
    public static let freeRecall = InkLayout(paper: .dotted, lines: INK_DOTTED_LINES)
    /// Map from memory: dotted, the whole screen (iPad DESIGN §6.6).
    public static let map = InkLayout(paper: .dotted, lines: INK_WHOLE_SCREEN_LINES)
}

public let INK_SHORT_LINES = 1
public let INK_RULED_LINES = 3
public let INK_SQUARED_ROWS = 8
/// "Most of a screen".
public let INK_DOTTED_LINES = 16
public let INK_WHOLE_SCREEN_LINES = 24
/// Teach-back is ruled at whiteboard size.
public let INK_WHITEBOARD_LINES = 12

/// Default paper per item type (iPad DESIGN §7). The learner never picks one.
public func defaultInkLayout(for type: ItemType) -> InkLayout {
    switch type {
    case .recall, .cloze, .predict: return InkLayout(paper: .short, lines: INK_SHORT_LINES)
    case .explain: return InkLayout(paper: .ruled, lines: INK_RULED_LINES)
    case .discriminate: return InkLayout(paper: .ruled, lines: INK_RULED_LINES, columns: 2)
    case .teachback: return InkLayout(paper: .ruled, lines: INK_WHITEBOARD_LINES)
    case .apply: return InkLayout(paper: .squared, lines: INK_SQUARED_ROWS)
    case .sketch: return InkLayout(paper: .dotted, lines: INK_DOTTED_LINES)
    case .map: return InkLayout(paper: .dotted, lines: INK_WHOLE_SCREEN_LINES)
    }
}

/// Starting lines for a paper when the pack overrides the paper but not the size.
public func defaultLines(for paper: Paper) -> Int {
    switch paper {
    case .short: return INK_SHORT_LINES
    case .ruled: return INK_RULED_LINES
    case .squared: return INK_SQUARED_ROWS
    case .dotted: return INK_DOTTED_LINES
    }
}

/// The item's ink area, honouring the pack's optional `item.ink` override (iPad DESIGN §7).
public func inkLayout(for item: Item) -> InkLayout {
    var layout = defaultInkLayout(for: item.type)
    if let paper = item.ink?.paper, paper != layout.paper {
        layout = InkLayout(paper: paper, lines: defaultLines(for: paper), columns: paper == .ruled ? layout.columns : 1)
    }
    if let lines = item.ink?.lines, lines > 0 { layout.lines = lines }
    return layout
}

public extension Item {
    var inkLayout: InkLayout { EpistemicsCore.inkLayout(for: self) }
}

// MARK: - Time by hand (iPad DESIGN §8)

/// Conservative starting estimates of seconds per answer by hand, per item type. The app replaces them with
/// this learner's measured hand-in times after the first week.
public let DEFAULT_SECONDS_BY_TYPE: [ItemType: Double] = [
    .recall: 20, .cloze: 20, .predict: 25, .explain: 60, .discriminate: 60, .apply: 90, .sketch: 90, .map: 300, .teachback: 120,
]

public func secondsByHand(_ type: ItemType, _ secondsByType: [ItemType: Double] = DEFAULT_SECONDS_BY_TYPE) -> Double {
    secondsByType[type] ?? DEFAULT_SECONDS_BY_TYPE[type] ?? DEFAULT_SECONDS_PER_ITEM
}

/// Whole minutes (rounded up) the queue will take by hand. Cards missing from `itemsByCard` count at the
/// web's flat 25 s.
public func estimateMinutesByHand(_ queue: Queue, itemsByCard: [String: QueueItemInfo],
                                  secondsByType: [ItemType: Double] = DEFAULT_SECONDS_BY_TYPE) -> Int {
    let seconds = queue.all.reduce(0.0) { acc, card in
        acc + (itemsByCard[card.id].map { secondsByHand($0.type, secondsByType) } ?? DEFAULT_SECONDS_PER_ITEM)
    }
    return Int((seconds / 60).rounded(.up))
}
