import SwiftUI
import EpistemicsCore

/// The concept card and the worked example, on the lesson page while help is allowed (UX-AUDIT §3.2, AUDIT
/// #6). It replaces the modal "Concept" sheet: in landscape it sits on the material page next to the dialogue,
/// in portrait it pulls down above it, and the learner can look at it and write at the same time.
///
/// The worked example follows `WorkedExamplePlan`: shown whole to study, or faded, with the last steps left
/// for the learner to write by hand and then compare. An advanced learner's example opens only after an
/// attempt.
struct ConceptCard: View {
    @Environment(AppModel.self) private var app
    let concept: Concept
    let plan: WorkedExamplePlan
    let attempted: Bool
    let area: InkAreaModel
    let revealed: Bool
    let onReveal: () -> Void

    @State private var showsMore = false

    private var steps: [String] { concept.script.workedExample.steps }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            idea
            Rectangle().fill(Theme.rule).frame(height: 1)
            workedExample
        }
        .layoutProbe("Concept card")
    }

    // MARK: The idea

    private var idea: some View {
        VStack(alignment: .leading, spacing: 10) {
            label("The idea")
            MaterialText(concept.definition, font: .readingSmall)
            DisclosureGroup(isExpanded: $showsMore) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(concept.objectives, id: \.id) { o in MaterialText("· " + o.text, font: .readingSmall) }
                    ForEach(concept.examples, id: \.title) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.title).font(.body15.weight(.semibold)).foregroundStyle(Theme.graphite)
                            MaterialText(e.body, font: .readingSmall)
                        }
                    }
                }
                .padding(.top, 8)
            } label: {
                Text("What you should be able to do, and examples").font(.body15).foregroundStyle(Theme.graphite)
            }
            .tint(Theme.graphite)
        }
    }

    // MARK: The worked example

    @ViewBuilder
    private var workedExample: some View {
        VStack(alignment: .leading, spacing: 12) {
            label(plan.studyFirst ? "Worked example · study it before you try" : "Worked example")
            if plan.foldedUntilAttempt && !attempted {
                Text("It opens once you've had a go at the question. Try it your way first.")
                    .font(.body15).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                MaterialText(concept.script.workedExample.problem, font: .readingSmall)
                ForEach(Array(steps.prefix(plan.typesetSteps).enumerated()), id: \.offset) { i, step in stepRow(i + 1, step) }
                if plan.learnerSteps > 0 { completion }
            }
        }
    }

    @ViewBuilder
    private var completion: some View {
        let first = plan.typesetSteps + 1
        let last = plan.typesetSteps + plan.learnerSteps
        let which = plan.learnerSteps == 1 ? "step \(first)" : "steps \(first) to \(last)"
        if !revealed {
            Text("Your turn: write \(which) by hand.")
                .font(.body15.weight(.semibold)).foregroundStyle(Theme.graphite)
            InkArea(area: area, tools: app.tools, allowsFingerDrawing: app.settings.allowFingerDrawing, logicalWidth: 520)
            HStack(spacing: 12) {
                Button("Compare with the example", action: onReveal)
                    .buttonStyle(.secondary)
                    .disabled(area.isEmpty)
                Button("Show me", action: onReveal).buttonStyle(.ghost)
            }
            Text("A rough go counts. Completing the step is what makes the example stick.")
                .font(.secondary).foregroundStyle(Theme.muted)
        } else {
            ForEach(Array(steps.dropFirst(plan.typesetSteps).enumerated()), id: \.offset) { i, step in stepRow(first + i, step) }
            Text("Does yours say the same thing? If not, what did the example do that you didn't?")
                .font(.body15).foregroundStyle(Theme.graphite).fixedSize(horizontal: false, vertical: true)
            if !area.isEmpty {
                Text("What you wrote").font(.secondary).foregroundStyle(Theme.muted)
                InkSnapshot(drawing: area.drawing, paper: .ruled, maxHeight: 160, showsPaper: false)
            }
        }
    }

    private func stepRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(n)")
                .font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.graphite)
                .frame(width: 24, height: 24)
                .background(Circle().fill(Theme.fill))
            MaterialText(text, font: .readingSmall)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(n): \(text)")
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.secondary.weight(.semibold)).foregroundStyle(Theme.muted)
    }
}
