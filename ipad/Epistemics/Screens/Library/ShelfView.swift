import SwiftUI
import UniformTypeIdentifiers
import EpistemicsCore

/// The Shelf: the courses on this iPad and the packs they come from (web DESIGN §8.2).
struct ShelfView: View {
    @Environment(AppModel.self) private var app
    @State private var packs: [Curriculum] = []
    @State private var importing = false
    @State private var message: String?

    var body: some View {
        ScrollView {
            PageColumn(width: 640) {
                Text("Shelf").font(.display).foregroundStyle(Theme.graphite)
                if let message { PageNote(text: message) }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Your courses").font(.heading).foregroundStyle(Theme.graphite)
                    ForEach(app.courses) { course in
                        let active = app.context?.course.id == course.id
                        Button {
                            Task { try? await app.open(courseId: course.id); app.screen = .today }
                        } label: {
                            HStack {
                                Text(course.title).font(.body15.weight(active ? .semibold : .regular)).foregroundStyle(Theme.graphite)
                                Spacer()
                                if active { Text("Open").font(.secondary).foregroundStyle(Theme.muted) }
                            }
                            .padding(14)
                            .background(RoundedRectangle(cornerRadius: 14).fill(active ? Theme.fillStrong : Theme.fill))
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Packs").font(.heading).foregroundStyle(Theme.graphite)
                    ForEach(packs, id: \.manifest.id) { pack in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(pack.manifest.title).font(.body15.weight(.semibold)).foregroundStyle(Theme.graphite)
                                Text(pack.manifest.description).font(.secondary).foregroundStyle(Theme.muted).lineLimit(3)
                            }
                            Spacer()
                            if !app.courses.contains(where: { $0.curriculumId == pack.manifest.id }) {
                                Button("Start") { Task { await enroll(pack) } }.buttonStyle(.secondary)
                            }
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.fill))
                    }
                    Button("Open a course file…") { importing = true }.buttonStyle(.ghost).padding(.leading, -16)
                    PageNote(text: "Build a course from a subject or your own material in the web or desktop app, export it, and open the .epistemics.json file here.")
                }
            }
            .padding(.top, 56).padding(.horizontal, 32).padding(.bottom, 60)
        }
        .background(Theme.paper)
        .task(id: app.revision) { packs = (try? await app.store.curricula()) ?? [] }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            guard case .success(let url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let c = try JSONDecoder().decode(Curriculum.self, from: Data(contentsOf: url))
                Task { try? await app.store.saveCurriculum(c); packs = (try? await app.store.curricula()) ?? [] }
                message = "Added \(c.manifest.title)."
            } catch {
                message = "That file isn't an Epistemics course."
            }
        }
    }

    private func enroll(_ pack: Curriculum) async {
        do {
            try await app.enroll(pack: pack, recall: "", minutesPerDay: app.settings.minutesPerDay, recallDrawing: nil)
            app.screen = .today
        } catch {
            message = "Couldn't start \(pack.manifest.title): \(error)"
        }
    }
}
