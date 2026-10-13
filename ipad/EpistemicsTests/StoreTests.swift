import Foundation
import Testing
import EpistemicsCore
@testable import Epistemics

@Suite struct StoreTests {
    @Test func roundTripsSettingsCardsAndInk() async throws {
        let store = try Store(url: nil)
        var settings = AppSettings()
        settings.handedness = .left
        try await store.setSetting("app", settings)
        #expect(try await store.setting("app", as: AppSettings.self)?.handedness == .left)

        let card = Card(id: "c1", courseId: "k", itemId: "i1", conceptId: "x", due: 1000)
        try await store.saveCards([card])
        #expect(try await store.cards(course: "k") == [card])

        let ink = InkRecord(id: "n1", courseId: "k", ownerKind: .review, ownerId: "s1", itemId: "i1", paper: .squared,
                            drawing: Data([1, 2, 3]), width: 700, height: 300, strokeCount: 4, writingMs: 5000,
                            firstStrokeMs: 800, createdAt: 10, updatedAt: 10)
        try await store.saveInk(ink)
        let back = try await store.ink("n1")
        #expect(back == ink)
    }

    @Test func findsThePreviousReceiptForAnItem() async throws {
        let store = try Store(url: nil)
        for (id, at) in [("r1", 100), ("r2", 200), ("r3", 300)] {
            try await store.saveReceipt(Receipt(id: id, sessionId: "s", courseId: "k", itemId: "i", conceptId: "c", answer: id,
                                                rating: .good, assisted: false, createdAt: at))
        }
        #expect(try await store.previousReceipt(course: "k", item: "i", before: 300)?.id == "r2")
        #expect(try await store.previousReceipt(course: "k", item: "i", before: 100) == nil)
    }
}
