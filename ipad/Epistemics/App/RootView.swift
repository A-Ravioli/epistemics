import SwiftUI
import EpistemicsCore

/// The app's frame: the first run until a course exists, then a sidebar and the screen, with sessions
/// taking the whole screen over both.
struct RootView: View {
    @Environment(AppModel.self) private var app
    @State private var columns: NavigationSplitViewVisibility = .doubleColumn

    var body: some View {
        @Bindable var app = app
        Group {
            if !app.loaded {
                Theme.paper.ignoresSafeArea()
            } else if !app.settings.onboarded || app.context == nil {
                FirstRunView()
            } else {
                NavigationSplitView(columnVisibility: $columns) {
                    Sidebar()
                        .navigationSplitViewColumnWidth(300)
                } detail: {
                    detail
                        .toolbar(.hidden, for: .navigationBar)
                }
                .navigationSplitViewStyle(.balanced)
            }
        }
        .tint(Theme.graphite)
        .fullScreenCover(item: $app.presented) { presented in
            SessionHost(presented: presented)
                .environment(app)
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch app.screen {
        case .today: TodayView()
        case .notebook: NotebookView()
        case .map: CourseMapView()
        case .progress: ProgressScreen()
        case .shelf: ShelfView()
        case .settings: SettingsView()
        }
    }
}

struct Sidebar: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        List {
            Section {
                ForEach([Screen.today, .notebook, .map, .progress]) { row($0) }
            } header: {
                Text(app.context?.course.title ?? "Course").font(.secondary.weight(.semibold)).foregroundStyle(Theme.muted)
            }
            Section {
                ForEach([Screen.shelf, .settings]) { row($0) }
            } header: {
                Text("Library").font(.secondary.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(Theme.paper2)
        .navigationTitle("Epistemics")
    }

    private func row(_ s: Screen) -> some View {
        let selected = app.screen == s
        return Button { app.screen = s } label: {
            Text(s.title)
                .font(.system(size: 17, weight: selected ? .semibold : .regular))
                .foregroundStyle(Theme.graphite)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(RoundedRectangle(cornerRadius: 12).fill(selected ? Theme.fillStrong : .clear).padding(.horizontal, 8))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Shows the session that was presented.
struct SessionHost: View {
    let presented: Presented
    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            if let ctx = app.context {
                switch presented {
                case .review: ReviewView(model: ReviewSessionModel(app: app, ctx: ctx))
                case .lesson(let id): LessonView(model: LessonSessionModel(app: app, ctx: ctx, lessonId: id))
                case .warmup(let id): WarmupView(model: WarmupModel(app: app, ctx: ctx, lessonId: id))
                case .checkpoint(let id): CheckpointView(model: CheckpointSessionModel(app: app, ctx: ctx, unitId: id))
                case .map(let id): MapFromMemoryView(model: MapSessionModel(app: app, ctx: ctx, unitId: id))
                case .teachback(let id): TeachbackView(model: TeachbackSessionModel(app: app, ctx: ctx, conceptId: id))
                }
            }
        }
        .background(Theme.paper.ignoresSafeArea())
    }
}
