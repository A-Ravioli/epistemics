import SwiftUI
import EpistemicsCore

@Observable @MainActor
final class FirstRunModel {
    enum Step: Int, Codable { case subject, recall, reflection, tutor, commitment }

    var step: Step = .subject { didSet { saveDraft() } }
    var packs: [Curriculum] = []
    var pack: Curriculum?
    let recallArea = InkAreaModel(paper: .dotted, minHeight: 420)
    var recallText = ""
    var named: [String] = []
    var reading = false
    var needsTutor = true
    var tutorMode: TutorMode = .claudeKey
    var apiKey = ""
    var proxyURL = ""
    var minutesPerDay = 20
    var enrolling = false
    var error: String?
    private weak var app: AppModel?

    var stepCount: Int { needsTutor ? 4 : 3 }
    var stepNumber: Int {
        switch step {
        case .subject: 1
        case .recall, .reflection: 2
        case .tutor: 3
        case .commitment: needsTutor ? 4 : 3
        }
    }
    var subjectName: String { pack?.manifest.subject.lowercased() ?? "this" }
    var reviewsPerDay: Int { schedulingFor(minutesPerDay).reviewsPerDay }

    var tutorChoiceComplete: Bool {
        switch tutorMode {
        case .demo: true
        case .claudeKey: apiKey.trimmingCharacters(in: .whitespaces).hasPrefix("sk-")
        case .proxy: URL(string: proxyURL.trimmingCharacters(in: .whitespaces))?.scheme?.hasPrefix("http") == true
        }
    }

    var reflection: String {
        if !named.isEmpty {
            let n = named.count
            return n == 1
                ? "You already named one of this course's concepts. I will check it early rather than teach it from scratch."
                : "You already named \(n) of this course's concepts. I will check them early rather than teach them from scratch."
        }
        return recallText.isEmpty
            ? "Nothing at all is a fine place to start, and the tutor will pitch the first lessons accordingly."
            : "That goes to the tutor, so the first lessons start from what you wrote rather than from nothing."
    }

    func load(app: AppModel) async {
        self.app = app
        packs = (try? await app.store.curricula()) ?? AppModel.bundledPacks()
        if pack == nil { pack = packs.first }
        // A device that already has a tutor is not asked again (ONBOARDING §6).
        needsTutor = app.settings.tutorMode == .demo && Secrets.get(Secrets.anthropicKey) == nil
        if !needsTutor { tutorMode = app.settings.tutorMode }
        minutesPerDay = app.settings.minutesPerDay
        if let draft = try? await app.store.setting("firstRun", as: FirstRunDraft.self) {
            if let id = draft.packId, let p = packs.first(where: { $0.manifest.id == id }) { pack = p }
            recallText = draft.recallText ?? ""
            if let s = Step(rawValue: draft.step), s != .recall { step = s }
            if let pack { named = conceptsNamed(pack, recallText) }
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

    /// Reads the recall on device: no model, no tutor yet, so the reflection works offline (ONBOARDING §3).
    func finishRecall(app: AppModel, empty: Bool) async {
        if empty {
            recallArea.reset()
            recallText = ""
        } else {
            reading = true
            recallText = await app.onDevice.read(recallArea.drawing)
            reading = false
        }
        if let pack { named = conceptsNamed(pack, recallText) }
        step = .reflection
    }

    func saveTutor(app: AppModel) {
        switch tutorMode {
        case .claudeKey: Secrets.set(Secrets.anthropicKey, apiKey.trimmingCharacters(in: .whitespaces))
        case .proxy: app.settings.proxyURL = proxyURL.trimmingCharacters(in: .whitespaces)
        case .demo: break
        }
        app.settings.tutorMode = tutorMode
    }

    func finish(app: AppModel) async {
        guard let pack else { step = .subject; return }
        enrolling = true
        defer { enrolling = false }
        do {
            app.settings.minutesPerDay = minutesPerDay
            try await app.enroll(pack: pack, recall: recallText, minutesPerDay: minutesPerDay,
                                 recallDrawing: recallArea.isEmpty ? nil : recallArea)
            try? await app.store.setSetting("firstRun", FirstRunDraft())
            app.settings.onboarded = true
        } catch {
            self.error = "Couldn't start the course: \(error)"
        }
    }

    private func saveDraft() {
        guard let app else { return }
        let draft = FirstRunDraft(step: step.rawValue, packId: pack?.manifest.id, recallText: recallText)
        Task { try? await app.store.setSetting("firstRun", draft) }
    }
}
