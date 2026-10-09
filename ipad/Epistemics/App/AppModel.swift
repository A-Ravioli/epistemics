import SwiftUI
import EpistemicsCore
import EpistemicsLLM

/// A screen in the sidebar.
enum Screen: String, Hashable, CaseIterable, Identifiable {
    case today, notebook, map, progress, shelf, settings
    var id: String { rawValue }
    var title: String {
        switch self {
        case .today: "Today"
        case .notebook: "Notebook"
        case .map: "Course map"
        case .progress: "Progress"
        case .shelf: "Shelf"
        case .settings: "Settings"
        }
    }
}

/// A session that takes the whole screen.
enum Presented: Identifiable, Hashable {
    case warmup(lessonId: String)
    case review
    case lesson(lessonId: String)
    case checkpoint(unitId: String)
    case map(unitId: String)
    case teachback(conceptId: String)

    var id: String {
        switch self {
        case .warmup(let id): "warmup:\(id)"
        case .review: "review"
        case .lesson(let id): "lesson:\(id)"
        case .checkpoint(let id): "checkpoint:\(id)"
        case .map(let id): "map:\(id)"
        case .teachback(let id): "teachback:\(id)"
        }
    }
}

/// The open course: its learner state lives in the store; this is what every session needs to hand.
struct CourseContext: Sendable {
    var course: Course
    var curriculum: Curriculum
    var scheduler: Scheduler
    var provider: any LLMProvider
    var now: @Sendable () -> EpochMs

    var dayConfig: (timezone: String, dayStartHour: Int) { (course.settings.timezone, course.settings.dayStartHour) }
}

@Observable @MainActor
final class AppModel {
    let store: Store
    let tools = InkToolState()
    let onDevice = OnDeviceReader()

    var settings = AppSettings() {
        didSet { if settings != oldValue { persistSettings() } }
    }
    var loaded = false
    var courses: [Course] = []
    var context: CourseContext?
    var screen: Screen = .today
    var presented: Presented?
    /// Bumped whenever learner state changes, so read-models (Today, the notebook) reload.
    var revision = 0
    var lastError: String?

    init(store: Store) {
        self.store = store
    }

    static func live() -> AppModel {
        let store: Store
        do { store = try Store(url: Store.defaultURL()) } catch {
            // Never trap the learner on a storage failure: fall back to memory and say so.
            store = try! Store(url: nil)
        }
        return AppModel(store: store)
    }

    // MARK: Loading

    func load() async {
        do {
            if let s = try await store.setting("app", as: AppSettings.self) { settings = s }
            try await installBundledPacks()
            courses = try await store.courses()
            if let id = settings.activeCourseId ?? courses.first?.id { try await open(courseId: id) }
        } catch {
            lastError = "Couldn't load your courses: \(error)"
        }
        loaded = true
    }

    /// Bundled packs (copied from web/content/packs at build time) go into the store on first launch.
    private func installBundledPacks() async throws {
        for pack in Self.bundledPacks() {
            if try await store.curriculum(id: pack.manifest.id, version: pack.manifest.version) == nil {
                try await store.saveCurriculum(pack)
            }
        }
    }

    static func bundledPacks() -> [Curriculum] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "Packs") ?? []
        return urls.compactMap { try? JSONDecoder().decode(Curriculum.self, from: Data(contentsOf: $0)) }
            .sorted { $0.manifest.title < $1.manifest.title }
    }

    func open(courseId: String) async throws {
        guard let course = try await store.course(courseId),
              let curriculum = try await store.curriculum(id: course.curriculumId, version: course.curriculumVersion) else { return }
        context = makeContext(course: course, curriculum: curriculum)
        if settings.activeCourseId != courseId { settings.activeCourseId = courseId }
        revision += 1
    }

    func makeContext(course: Course, curriculum: Curriculum) -> CourseContext {
        let examCap = course.goals.examDate.map { daysToExam(now: Self.now(), examDate: $0) }
        let scheduler = Scheduler(SchedulerParams(desiredRetention: course.settings.desiredRetention,
                                                  maximumIntervalDays: examCap))
        return CourseContext(course: course, curriculum: curriculum, scheduler: scheduler, provider: makeProvider(), now: { Self.now() })
    }

    /// Rebuilds the provider after the tutor settings change.
    func refreshProvider() {
        guard var ctx = context else { return }
        ctx.provider = makeProvider()
        context = ctx
    }

    nonisolated static func now() -> EpochMs { Int(Date().timeIntervalSince1970 * 1000) }

    // MARK: Settings

    private func persistSettings() {
        let s = settings
        Task { try? await store.setSetting("app", s) }
    }

    var isDemoTutor: Bool { settings.tutorMode == .demo }

    // MARK: Changes

    func didChangeLearnerState() { revision += 1 }

    func present(_ p: Presented) { presented = p }
    func dismissSession() {
        presented = nil
        revision += 1
    }
}
