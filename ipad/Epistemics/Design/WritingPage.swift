import SwiftUI

/// How a writing page is laid out (docs/UX-AUDIT.md §2). Chosen from the window, not the device, so Split
/// View and Stage Manager get the right one.
enum WritingLayout: Equatable {
    /// Portrait: one column, the free-hand rail pinned in the margin beside it.
    case column
    /// Landscape: an open notebook. The material on the free hand's page, the paper on the writing hand's
    /// page, the rail on the outside edge.
    case spread
    /// Split View and Slide Over: one column, the rail along the bottom.
    case compact

    static func choose(size: CGSize, sizeClass: UserInterfaceSizeClass?) -> WritingLayout {
        if sizeClass == .compact || size.width < 640 { return .compact }
        if size.width > size.height && size.width >= 1000 { return .spread }
        return .column
    }
}

extension EnvironmentValues {
    /// How the free-hand rail runs: `.vertical` in the side margin, `.horizontal` in a bottom bar. Rail
    /// controls (the tool tray, hand-in buttons) lay themselves out to match.
    @Entry var railAxis: Axis = .horizontal
    /// The on-screen height a fresh sheet of working paper may fill (squared and dotted paper start this tall,
    /// so the page is paper rather than empty space). 0: use the paper's own starting height.
    @Entry var paperFillHeight: CGFloat = 0
    /// Inside a WritingPage's bottom bar (compact width).
    @Entry var inBottomBar = false
}

/// The page every answering screen uses: material (the prompt, or the dialogue), the paper, and the
/// free-hand rail (tools and hand-in), laid out for the window.
///
/// - The rail is never inside a scroll view, so tools and Hand in are always on screen (UX-AUDIT B1, B2).
/// - In a column, single-question pages pin the prompt above the scrolling paper, so the question never
///   scrolls away while the learner writes (UX-AUDIT §3.1).
/// - The paper keeps its logical width and is scaled to fit by `InkArea` (UX-AUDIT §2).
struct WritingPage<Material: View, Paper: View, Rail: View>: View {
    var handedness: Handedness
    /// Pin the material above the paper in a column. Off for lessons, whose material is the whole dialogue.
    var pinsMaterial = true
    /// Change it to scroll both panes to their ends (a lesson's newest turn).
    var scrollToken: Int = 0
    /// A reference to keep in view while writing (a lesson's concept card and worked example): at the top of
    /// the material page in a spread, a pull-down panel above the page in a column. Nil: none.
    var reference: AnyView? = nil
    var referenceTitle = "The idea, and a worked example"
    /// Whether the panel starts open in a column (it always starts open in a spread). The learner's own
    /// open/close holds until `referenceKey` changes (a new concept).
    var referenceOpen = false
    var referenceKey = ""
    /// Change it to scroll the reference to its end (newly revealed steps).
    var referenceScrollToken = 0
    @ViewBuilder var material: () -> Material
    @ViewBuilder var paper: () -> Paper
    @ViewBuilder var rail: () -> Rail

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var materialHeight: CGFloat = 0
    @State private var referenceExpanded: Bool?
    @State private var referenceHeight: CGFloat = 0

    static var railWidth: CGFloat { 132 }

    var body: some View {
        GeometryReader { geo in
            switch WritingLayout.choose(size: geo.size, sizeClass: sizeClass) {
            case .spread: spread(geo.size)
            case .column: column(geo.size)
            case .compact: compact(geo.size)
            }
        }
    }

    // MARK: Layouts

    private func column(_ size: CGSize) -> some View {
        HStack(alignment: .top, spacing: 0) {
            if handedness == .right { sideRail }
            VStack(spacing: 0) {
                if let reference { referencePanel(reference, spread: false, maxHeight: size.height * 0.5) }
                if pinsMaterial {
                    pinnedMaterial(maxHeight: size.height * 0.4)
                    let viewport = size.height - min(materialHeight, size.height * 0.4)
                    pane(fill: viewport - 140) { paper() }
                } else {
                    pane(fill: size.height * 0.45) {
                        material()
                        paper()
                    }
                }
            }
            .frame(maxWidth: .infinity)
            if handedness == .left { sideRail }
        }
    }

    private func spread(_ size: CGSize) -> some View {
        let materialWidth = min(580, max(400, size.width * (reference == nil ? 0.38 : 0.42)))
        return HStack(alignment: .top, spacing: 0) {
            if handedness == .right {
                sideRail
                materialPage(width: materialWidth, height: size.height)
                gutter
                pane(fill: size.height - 140) { paper() }
            } else {
                pane(fill: size.height - 140) { paper() }
                gutter
                materialPage(width: materialWidth, height: size.height)
                sideRail
            }
        }
    }

    private func compact(_ size: CGSize) -> some View {
        VStack(spacing: 0) {
            if let reference { referencePanel(reference, spread: false, maxHeight: size.height * 0.4) }
            pane(fill: size.height * 0.4) {
                material()
                paper()
            }
            // The tools on one row, the actions together on the next.
            Group(subviews: rail()) { parts in
                VStack(alignment: .leading, spacing: 10) {
                    if let tools = parts.first { tools }
                    if parts.count > 1 {
                        HStack(spacing: 12) { ForEach(parts.dropFirst()) { $0 } }
                    }
                }
            }
                .environment(\.railAxis, .horizontal)
                .environment(\.inBottomBar, true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Theme.paper)
                .overlay(alignment: .top) { Rectangle().fill(Theme.rule).frame(height: 1) }
        }
    }

    // MARK: Parts

    private var sideRail: some View {
        VStack(alignment: .center, spacing: 16) { rail() }
            .environment(\.railAxis, .vertical)
            .padding(.horizontal, 12)
            .frame(width: Self.railWidth)
            .padding(.top, 16)
            .frame(maxHeight: .infinity, alignment: .top)
    }

    private var gutter: some View {
        Rectangle().fill(Theme.rule).frame(width: 1).padding(.vertical, 24)
    }

    /// The material on its own page (spread). The dialogue scrolls to its newest turn with the paper.
    private func materialPage(width: CGFloat, height: CGFloat) -> some View {
        VStack(spacing: 0) {
            if let reference { referencePanel(reference, spread: true, maxHeight: height * 0.65) }
            dialoguePage
        }
        .frame(width: width)
    }

    /// The reference as a card that opens and closes; it scrolls on its own past `maxHeight`.
    private func referencePanel(_ reference: AnyView, spread: Bool, maxHeight: CGFloat) -> some View {
        let open = referenceExpanded ?? (spread ? true : referenceOpen)
        return VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeOut(duration: 0.2)) { referenceExpanded = !open } } label: {
                HStack {
                    Text(referenceTitle).font(.body15.weight(.semibold)).foregroundStyle(Theme.graphite)
                    Spacer()
                    Image(systemName: open ? "chevron.up" : "chevron.down").foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 18).frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(open ? "Hide \(referenceTitle)" : "Show \(referenceTitle)")
            if open {
                ScrollViewReader { proxy in
                    ScrollView {
                        reference
                            .padding(.horizontal, 18).padding(.bottom, 18)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { referenceHeight = $0 }
                        Color.clear.frame(height: 1).id("referenceEnd")
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    .onChange(of: referenceScrollToken) {
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(120))
                            withAnimation { proxy.scrollTo("referenceEnd", anchor: .bottom) }
                        }
                    }
                }
                .frame(height: min(max(referenceHeight, 60), maxHeight))
            }
        }
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.paper2))
        .frame(maxWidth: spread ? .infinity : Theme.readingWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, spread ? 16 : 20).padding(.top, 10).padding(.bottom, 6)
        .onChange(of: referenceKey) { referenceExpanded = nil }
    }

    /// The dialogue on the material page (spread): scrolls to its newest turn with the paper.
    private var dialoguePage: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) { material() }
                    .padding(.horizontal, 28).padding(.top, 16).padding(.bottom, 40)
                Color.clear.frame(height: 1).id("end")
            }
            .onChange(of: scrollToken) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            .onAppear { proxy.scrollTo("end", anchor: .bottom) }
        }
    }

    /// The prompt above the paper in a column: as tall as it needs, scrolling only past 40% of the page.
    private func pinnedMaterial(maxHeight: CGFloat) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) { material() }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 12)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { materialHeight = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(height: min(materialHeight, maxHeight))
    }

    /// A scrolling pane: the paper (and in a column, the dialogue), at reading width, with the starting
    /// height a fresh sheet may fill.
    private func pane<C: View>(fill: CGFloat, @ViewBuilder _ content: () -> C) -> some View {
        let built = content()
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) { built }
                    .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 40)
                    .environment(\.paperFillHeight, max(0, fill))
                Color.clear.frame(height: 1).id("end")
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: scrollToken) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Rail controls

/// A full-width capsule for the vertical rail: the same weight as the page's buttons, narrow enough for
/// the margin, never wrapping.
struct RailButtonStyle: ButtonStyle {
    var prominent = false
    func makeBody(configuration: Configuration) -> some View {
        Styled(configuration: configuration, prominent: prominent)
    }

    private struct Styled: View {
        let configuration: Configuration
        let prominent: Bool
        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.railAxis) private var axis
        var body: some View {
            configuration.label
                .font(.system(size: 15, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .foregroundStyle(prominent ? Theme.onGraphite : Theme.graphite)
                .padding(.horizontal, axis == .vertical ? 0 : 12)
                .frame(maxWidth: axis == .vertical ? .infinity : nil, minHeight: 48)
                .padding(.horizontal, 10)
                .background(Capsule().fill(prominent ? Theme.graphite : Theme.fill))
                .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
                .contentShape(Capsule())
        }
    }
}

/// The lesson's single Hand in: a circle in the side rail, a pill in the bottom bar.
struct HandInButton: View {
    var title = "Hand in"
    var enabled: Bool
    let action: () -> Void
    @Environment(\.railAxis) private var axis

    var body: some View {
        Group {
            if axis == .vertical {
                Button(action: action) {
                    Text(title.replacingOccurrences(of: " ", with: "\n"))
                        .font(.system(size: 14, weight: .semibold)).multilineTextAlignment(.center)
                        .foregroundStyle(Theme.onGraphite)
                        .frame(width: 76, height: 76)
                        .background(Circle().fill(Theme.graphite))
                }
                .buttonStyle(.plain)
                .opacity(enabled ? 1 : 0.4)
            } else {
                Button(title, action: action).buttonStyle(.primaryLarge)
            }
        }
        .disabled(!enabled)
        .accessibilityLabel(title)
        .layoutProbe(title)
    }
}

// MARK: - Layout probe (debug builds)

#if DEBUG
/// Where the rail's controls last were on screen, so tests can check they stay visible (LayoutTests).
@MainActor enum LayoutProbe {
    static var frames: [String: CGRect] = [:]
}
#endif

extension View {
    /// Debug builds: report this view's on-screen frame under `name` (`LayoutProbe`). Nothing in release.
    func layoutProbe(_ name: String) -> some View {
        #if DEBUG
        onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { LayoutProbe.frames[name] = $0 }
        #else
        self
        #endif
    }
}
