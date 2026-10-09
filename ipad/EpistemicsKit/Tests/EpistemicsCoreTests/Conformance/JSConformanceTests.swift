import Foundation
import Testing
@testable import EpistemicsCore

/// JS number and string semantics against Node (fixture js.json).
@Suite struct JSConformanceTests {
    static let fx = try! Fixtures.json("js.json")

    @Test func numberToStringMatchesJavaScript() {
        var failures: [String] = []
        for c in Self.fx["numberStrings"]!.array {
            let x = bits(c[0])
            if jsNumberString(x) != c[1].string { failures.append("\(c[0].string): \(jsNumberString(x)) vs \(c[1].string)") }
        }
        #expect(failures.isEmpty, "\(failures.prefix(10))")
        #expect(Self.fx["numberStrings"]!.array.count > 5000)
    }

    @Test func jsonDecoderParsesDoublesExactly() throws {
        // The fixtures also carry plain JSON numbers (card states); they must parse to the same bits.
        var bad = 0
        for c in Self.fx["numberStrings"]!.array {
            let x = bits(c[0])
            guard x.isFinite, c[1].string != "-0" else { continue }
            let parsed = try JSONDecoder().decode([Double].self, from: Data("[\(c[1].string)]".utf8))[0]
            if parsed.bitPattern != x.bitPattern && !(x == 0 && parsed == 0) { bad += 1 }
        }
        #expect(bad == 0)
    }

    @Test func toFixedMatchesJavaScript() {
        var failures: [String] = []
        for c in Self.fx["toFixed"]!.array {
            let x = bits(c[0]), d = c[1].int
            if jsToFixed(x, d) != c[2].string { failures.append("\(x).toFixed(\(d)): \(jsToFixed(x, d)) vs \(c[2].string)") }
        }
        #expect(failures.isEmpty, "\(failures.prefix(10))")
    }

    @Test func aleaMatchesTsFsrs() {
        let cases = Self.fx["alea"]!.array
        #expect(cases.count > 300)
        for c in cases {
            var g = Alea(seed: c[0].string)
            let got = (0..<5).map { _ in bitsHex(g.next()) }
            #expect(got == c[1].array.map(\.string), "seed \(c[0].string)")
        }
    }

    @Test func seededGeneratorsMatch() {
        for c in Self.fx["mulberry"]!.array {
            let g = mulberry32(c[0].int)
            #expect((0..<20).map { _ in bitsHex(g()) } == c[1].array.map(\.string))
        }
        for c in Self.fx["lcg"]!.array {
            let g = seededRng(c[0].int)
            #expect((0..<20).map { _ in bitsHex(g()) } == c[1].array.map(\.string))
        }
    }

    @Test func localeCompareMatchesV8OnIdentifiers() {
        var failures: [String] = []
        for c in Self.fx["localeCompare"]!.array where jsLocaleCompare(c[0].string, c[1].string) != c[2].int {
            failures.append("\(c[0].string) vs \(c[1].string): \(jsLocaleCompare(c[0].string, c[1].string)) != \(c[2].int)")
        }
        #expect(failures.isEmpty, "\(failures.prefix(10))")
    }

    @Test func sortCallsTheComparatorInV8Order() {
        for (t, c) in Self.fx["sortLogs"]!.array.enumerated() {
            let values = c["values"]!.array.map(\.int)
            var log: [Int] = []
            let sorted = jsSorted(Array(values.enumerated())) { x, y in
                log.append(x.offset); log.append(y.offset)
                return Double(x.element - y.element)
            }.map(\.offset)
            #expect(log == c["log"]!.array.map(\.int), "trial \(t), n = \(values.count)")
            #expect(sorted == c["sorted"]!.array.map(\.int))
        }
    }

    @Test func canonicalJsonAndHashes() {
        for c in Self.fx["canonical"]!.array { #expect(canonicalJson(c[0]) == c[1].string) }
        for c in Self.fx["sha256"]!.array { #expect(sha256(c[0].string) == c[1].string) }
        for c in Self.fx["stableId"]!.array { #expect(stableId(c[0].string, c[1].string) == c[2].string) }
    }

    @Test func uuidv7Shape() {
        let id = uuidv7(1_773_144_000_000)
        #expect(id.wholeMatch(of: /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/) != nil)
        let h = String(1_773_144_000_000, radix: 16).leftPadded(12)
        #expect(id.prefix(13) == "\(h.prefix(8))-\(h.suffix(4))")
        #expect(uuidv7(1) < uuidv7(2))
    }
}
