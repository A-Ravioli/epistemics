import SwiftUI

/// Confirming a reading (DESIGN §5.3): the learner fixes a misreading by choosing what they wrote.
/// There is no keyboard here, so confirming can never become a second attempt at the answer.
struct ConfirmReadingView: View {
    let reading: InkReading
    let onConfirm: (String) -> Void

    @State private var choices: [Int: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Read as").font(.secondary).foregroundStyle(Theme.muted)
            MaterialText(confirmedText, font: .readingSmall)
                .accessibilityLabel("Your answer, read as: \(confirmedText)")

            ForEach(Array(reading.uncertain.enumerated()), id: \.offset) { index, span in
                VStack(alignment: .leading, spacing: 8) {
                    Text("Did you write…").font(.body15).foregroundStyle(Theme.graphite)
                    HStack(spacing: 10) {
                        ForEach(options(for: span), id: \.self) { option in
                            let selected = (choices[index] ?? span.span) == option
                            Button { choices[index] = option } label: {
                                Text(MathText.attributed(option))
                                    .font(.readingSmall)
                                    .foregroundStyle(selected ? Theme.onGraphite : Theme.graphite)
                                    .padding(.horizontal, 18)
                                    .frame(minHeight: 44)
                                    .background(Capsule().fill(selected ? Theme.graphite : Theme.fill))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(selected ? .isSelected : [])
                        }
                    }
                }
            }

            HStack(spacing: 12) {
                Button("That's what I wrote") { onConfirm(confirmedText) }
                    .buttonStyle(.primary)
                Text("The grader sees only these words, never your page.")
                    .font(.secondary).foregroundStyle(Theme.muted)
            }
        }
    }

    private func options(for span: UncertainSpan) -> [String] {
        var seen = Set<String>()
        return ([span.span] + span.alternatives).filter { seen.insert($0).inserted }
    }

    /// The reading with each uncertain span replaced by the learner's choice.
    var confirmedText: String {
        var text = reading.text
        for (index, span) in reading.uncertain.enumerated() {
            guard let choice = choices[index], choice != span.span, let r = text.range(of: span.span) else { continue }
            text.replaceSubrange(r, with: choice)
        }
        return text
    }
}

/// When to ask the learner to confirm a reading (DESIGN §5.3).
enum ConfirmPolicy {
    enum Context { case review, unaidedCheck, checkpoint, map, lessonTurn }

    static func needsConfirmation(_ reading: InkReading, context: Context, hasMathOrDiagram: Bool) -> Bool {
        switch context {
        case .checkpoint, .unaidedCheck, .map: return true
        case .lessonTurn: return false
        case .review: return !reading.uncertain.isEmpty || hasMathOrDiagram
        }
    }

    /// A crude but adequate test for "this answer contains maths": LaTeX, operators between numbers, or symbols.
    static func looksMathematical(_ text: String) -> Bool {
        if text.contains("$") || text.contains("\\") { return true }
        let ops = CharacterSet(charactersIn: "×÷=^√∑∫≤≥≠/")
        return text.unicodeScalars.contains { ops.contains($0) } && text.contains(where: \.isNumber)
    }
}
