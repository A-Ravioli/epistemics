import SwiftUI
import EpistemicsCore

/// The line across the top of a session: leave, where you are, and one quiet trailing line.
struct SessionHeader<Trailing: View>: View {
    let title: String
    var subtitle: String? = nil
    var closeLabel = "Leave"
    var onClose: (() -> Void)? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 16) {
            Group {
                if let onClose {
                    IconButton(systemName: "xmark", label: closeLabel, action: onClose)
                } else {
                    Color.clear.frame(width: Theme.controlMin, height: Theme.controlMin)
                }
            }
            .frame(width: 180, alignment: .leading)
            VStack(spacing: 2) {
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.graphite)
                if let subtitle { Text(subtitle).font(.secondary).foregroundStyle(Theme.muted) }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            trailing().frame(width: 180, alignment: .trailing)
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
    }
}

extension SessionHeader where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, closeLabel: String = "Leave", onClose: (() -> Void)? = nil) {
        self.title = title; self.subtitle = subtitle; self.closeLabel = closeLabel; self.onClose = onClose
        self.trailing = { EmptyView() }
    }
}

/// The hand-in for an unaided item: the confidence rating *is* the hand-in (DESIGN §4).
struct ConfidenceHandIn: View {
    var enabled = true
    var showsDontKnow = true
    let onHandIn: (Confidence) -> Void
    var onDontKnow: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Text("Hand in. How sure are you?")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.graphite)
                .padding(.trailing, 6)
            ForEach(Confidence.allCases, id: \.self) { c in
                Button(c.label) { onHandIn(c) }
                    .buttonStyle(.secondaryLarge)
                    .disabled(!enabled)
                    .accessibilityHint("Hands in your answer and records your confidence")
            }
            Spacer(minLength: 0)
            if showsDontKnow, let onDontKnow {
                Button("I don't know", action: onDontKnow).buttonStyle(.ghost)
            }
        }
        .opacity(enabled ? 1 : 0.5)
    }
}

extension Confidence {
    var label: String {
        switch self {
        case .guess: "Guessing"
        case .fairlySure: "Fairly sure"
        case .certain: "Certain"
        }
    }
}

extension Rating {
    var label: String {
        switch self {
        case .again: "Again"
        case .hard: "Hard"
        case .good: "Good"
        case .easy: "Easy"
        }
    }
}

/// A muted line with a spinner, for the few seconds a model takes.
struct WorkingLine: View {
    let text: String
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(text).font(.secondary).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The one tinted block: a state the learner must notice (an error, the demo tutor).
struct Banner: View {
    let text: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil
    var body: some View {
        HStack(spacing: 12) {
            Text(text).font(.body15).foregroundStyle(Theme.graphite).frame(maxWidth: .infinity, alignment: .leading)
            if let actionTitle, let action { Button(actionTitle, action: action).buttonStyle(.secondary) }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.warn.opacity(0.12)))
    }
}

/// A note on the page from the app, not the tutor (folded page, saved, errors).
struct PageNote: View {
    let text: String
    var body: some View {
        Text(text).font(.secondary).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The page column: reading width, centred.
struct PageColumn<Content: View>: View {
    var width: CGFloat = Theme.readingWidth
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 22) { content() }
            .frame(maxWidth: width)
            .frame(maxWidth: .infinity)
    }
}
