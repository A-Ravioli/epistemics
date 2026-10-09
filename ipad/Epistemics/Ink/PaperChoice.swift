import EpistemicsCore

/// The paper says what kind of answer is expected (DESIGN §3, §7). A pack's `item.ink` overrides it.
func inkPaper(for item: Item) -> (paper: Paper, lines: Int?) {
    let base: Paper = switch item.type {
    case .recall, .cloze: .short
    case .predict: .short
    case .explain, .discriminate, .teachback: .ruled
    case .apply: .squared
    case .map, .sketch: .dotted
    }
    return (item.ink?.paper ?? base, item.ink?.lines)
}
