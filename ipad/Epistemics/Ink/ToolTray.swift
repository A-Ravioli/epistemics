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
    @Environment(\.railAxis) private var axis

    var body: some View {
        // Vertical in the side rail (and by default, beside an inline ink area); a row in the bottom bar.
        let layout = axis == .horizontal && inBottomBar ? AnyLayout(HStackLayout(spacing: 4)) : AnyLayout(VStackLayout(spacing: 4))
        layout {
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
        .layoutProbe("Tools")
        .onPencilDoubleTap { _ in
            // Second-generation Pencil: the same switch (UX-AUDIT §1).
            tools.tool = tools.tool == .pen ? .eraser : .pen
        }
    }

    /// Only a WritingPage's bottom bar lays the tray out as a row; inline trays elsewhere stay vertical.
    @Environment(\.inBottomBar) private var inBottomBar

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
