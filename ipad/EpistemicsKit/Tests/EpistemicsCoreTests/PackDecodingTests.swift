import Foundation
import Testing
@testable import EpistemicsCore

@Suite struct PackDecodingTests {
    @Test func decodesTheBundledProbabilityPack() throws {
        let url = Bundle.module.url(forResource: "probability-basics.epistemics", withExtension: "json", subdirectory: "Fixtures")!
        let pack = try JSONDecoder().decode(Pack.self, from: Data(contentsOf: url))
        #expect(pack.units.count == 2)
        #expect(pack.allLessons.count == 8)
        #expect(pack.allConcepts.count == 29)
        #expect(pack.allItems.count == 179)
        #expect(pack.allConcepts.allSatisfy { $0.script.hints.count == 3 })
    }
}
