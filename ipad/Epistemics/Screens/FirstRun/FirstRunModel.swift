import SwiftUI
import EpistemicsCore

/// The first run (ipad DESIGN §6.1): what to learn, who marks it, a placement test, and the time and the one
/// rule. The placement replaces the web's free-recall step: rather than asking what the learner knows, it
/// finds out, and skips the lessons they don't need.
@Observable @MainActor
final class FirstRunModel {
    enum Step: Int, Codable { case subject, tutor, placement, commitment }

    var step: Step = .subject { didSet { saveDraft() } }
    var packs: [Curriculum] = []
    var pack: Curriculum?
    var needsTutor = true
    var tutorMode: TutorMode = .claudeKey
    var apiKey = ""
    var proxyURL = ""
    var minutesPerDay = 20
    var working = false
    var error: String?
    var placement: PlacementModel?
    private weak var app: AppModel?

    var stepCount: Int { needsTutor ? 4 : 3 }
    var stepNumber: Int {
        switch step {
        case .subject: 1
        case .tutor: 2
        case .placement: needsTutor ? 3 : 2
        case .commitment: needsTutor ? 4 : 3
        }
    }
    var reviewsPerDay: Int { schedulingFor(minutesPerDay).reviewsPerDay }

    var tutorChoiceComplete: Bool {
        switch tutorMode {
        case .demo: true
        case .claudeKey: apiKey.trimmingCharacters(in: .whitespaces).hasPrefix("sk-")
        case .proxy: URL(string: proxyURL.trimmingCharacters(in: .whitespaces))?.scheme?.hasPrefix("http") == true
        }
    }

    func load(app: AppModel) async {
        self.app = app
        packs = (try? await app.store.curricula()) ?? AppModel.bundledPacks()
        if pack == nil { pack = packs.first }
        // A device that already has a tutor is not asked again (ONBOARDING §6).
        needsTutor = app.settings.tutorMode == .demo && Secrets.get(Secrets.anthropicKey) == nil
        if !needsTutor { tutorMode = app.settings.tutorMode }
        minutesPerDay = app.settings.minutesPerDay
        guard let draft = try? await app.store.setting("firstRun", as: FirstRunDraft.self) else { return }
        if let id = draft.packId, let p = packs.first(where: { $0.manifest.id == id }) { pack = p }
        // Resume: a course already enrolled in this flow goes back to its placement or to the time step.
        switch Step(rawValue: draft.step) {
        case .placement?, .commitment?:
            if let ctx = app.context, ctx.course.curriculumId == pack?.manifest.id {
                if draft.step == Step.commitment.rawValue {
                    step = .commitment
                } else {
                    placement = PlacementModel(app: app, ctx: ctx)
                    step = .placement
                }
            }
        case .tutor?: step = .tutor
        default: break
        }
    }

    func importPack(_ url: URL, app: AppModel) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let c = try JSONDecoder().decode(Curriculum.self, from: Data(contentsOf: url))
            Task { try? await app.store.saveCurriculum(c) }
            if !packs.contains(where: { $0.manifest.id == c.manifest.id }) { packs.append(c) }
            pack = c
            error = nil
        } catch {
            self.error = "That file isn't an Epistemics course (\(error.localizedDescription))."
        }
    }

    func continueFromSubject(app: AppModel) async {
        if needsTutor { step = .tutor } else { await startPlacement(app: app) }
    }

    func saveTutor(app: AppModel) async {
        switch tutorMode {
        case .claudeKey: Secrets.set(Secrets.anthropicKey, apiKey.trimmingCharacters(in: .whitespaces))
        case .proxy: app.settings.proxyURL = proxyURL.trimmingCharacters(in: .whitespaces)
        case .demo: break
        }
        app.settings.tutorMode = tutorMode
        app.refreshProvider()
        await startPlacement(app: app)
    }

    /// Enrols now, because the placement records receipts and seeds cards; the time step adjusts it after.
    private func startPlacement(app: AppModel) async {
        guard let pack else { return }
        working = true
        defer { working = false }
        do {
            if app.context?.course.curriculumId != pack.manifest.id {
                try await app.enroll(pack: pack, recall: "", minutesPerDay: minutesPerDay, recallDrawing: nil)
            }
            guard let ctx = app.context else { return }
            placement = PlacementModel(app: app, ctx: ctx)
            step = .placement
        } catch {
            self.error = "Couldn't start the course: \(error)"
        }
    }

    func finish(app: AppModel) async {
        working = true
        defer { working = false }
        do {
            app.settings.minutesPerDay = minutesPerDay
            try await app.applySchedule(minutesPerDay: minutesPerDay)
            try? await app.store.setSetting("firstRun", FirstRunDraft())
            app.settings.onboarded = true
        } catch {
            self.error = "Couldn't save your schedule: \(error)"
        }
    }

    private func saveDraft() {
        guard let app else { return }
        let draft = FirstRunDraft(step: step.rawValue, packId: pack?.manifest.id)
        Task { try? await app.store.setSetting("firstRun", draft) }
    }
}

extension AppModel {
    /// Minutes a day set the whole review load (ONBOARDING §5, with the iPad's by-hand rate).
    func applySchedule(minutesPerDay: Int) async throws {
        guard var course = context?.course else { return }
        let derived = schedulingFor(minutesPerDay)
        course.settings.reviewsPerDay = derived.reviewsPerDay
        course.settings.desiredRetention = derived.desiredRetention
        course.goals.weeklyMinutes = derived.weeklyMinutes
        course.updatedAt = Self.now()
        try await store.saveCourse(course)
        try await open(courseId: course.id)
    }
}
