import SwiftUI
import PencilKit

/// Which hand writes. Controls live under the other one (DESIGN §2, rule 3).
enum Handedness: String, Codable, CaseIterable, Sendable {
    case right, left
}

/// Pen, eraser, lasso, undo. Nothing else (§3).
struct ToolTray: View {
    @Bindable var tools: InkToolState
    var showsLasso = true

    var body: some View {
        VStack(spacing: 4) {
            toolButton(.pen, "pencil.tip", "Pen")
            toolButton(.eraser, "eraser", "Eraser")
            if showsLasso { toolButton(.lasso, "lasso", "Lasso, to move ink") }
            Button { tools.undoRequests += 1 } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 19))
                    .foregroundStyle(Theme.graphite)
                    .frame(width: 48, height: 48)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Undo")
        }
        .padding(6)
        .background(Capsule().fill(Theme.sheet).shadow(color: .black.opacity(0.06), radius: 1, y: 1).shadow(color: .black.opacity(0.06), radius: 8, y: 4))
        .onPencilSqueeze { _ in
            // Squeeze cycles pen ↔ eraser, as the system palette would; it never hands in (§2).
            tools.tool = tools.tool == .pen ? .eraser : .pen
        }
    }

    private func toolButton(_ tool: InkTool, _ symbol: String, _ label: String) -> some View {
        let selected = tools.tool == tool
        return Button { tools.tool = tool } label: {
            Image(systemName: symbol)
                .font(.system(size: 19))
                .foregroundStyle(selected ? Theme.onGraphite : Theme.graphite)
                .frame(width: 48, height: 48)
                .background(Circle().fill(selected ? Theme.graphite : .clear))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Lays out a writing page with the tray and the hand-in controls on the free-hand side.
struct FreeHandLayout<Tray: View, Page: View>: View {
    let handedness: Handedness
    @ViewBuilder var tray: () -> Tray
    @ViewBuilder var page: () -> Page

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if handedness == .right { side }
            page().frame(maxWidth: .infinity)
            if handedness == .left { side }
        }
    }

    private var side: some View {
        VStack { tray() }
            .frame(width: 84)
            .padding(.top, 16)
    }
}
