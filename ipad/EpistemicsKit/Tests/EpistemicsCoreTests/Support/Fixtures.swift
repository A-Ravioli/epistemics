import Foundation
@testable import EpistemicsCore

/// Loads JSON fixtures exported by `node ipad/Tools/export-conformance.mjs` (and the bundled pack).
enum Fixtures {
    static func url(_ name: String, _ subdirectory: String = "Fixtures/conformance") -> URL {
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        guard let url = Bundle.module.url(forResource: base, withExtension: ext, subdirectory: subdirectory) else {
            fatalError("missing fixture \(subdirectory)/\(name); run node ipad/Tools/export-conformance.mjs")
        }
        return url
    }

    static func data(_ name: String, _ subdirectory: String = "Fixtures/conformance") -> Data {
        try! Data(contentsOf: url(name, subdirectory))
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String, _ subdirectory: String = "Fixtures/conformance") throws -> T {
        try JSONDecoder().decode(T.self, from: data(name, subdirectory))
    }

    static func json(_ name: String) throws -> JSONValue { try decode(JSONValue.self, name) }

    static let pack: Pack = try! decode(Pack.self, "probability-basics.epistemics.json", "Fixtures")
    /// web/packages/core/test/session/fixture.ts `curriculum`.
    static let core: Curriculum = try! decode(Curriculum.self, "core-fixture.json")
    /// web/apps/web/test-fixtures/tiny-pack.ts.
    static let tiny: Curriculum = try! decode(Curriculum.self, "tiny-pack.json")
}

/// A double from its IEEE-754 bit pattern in hex (the fixtures carry exact values this way).
func bits(_ hex: String) -> Double { Double(bitPattern: UInt64(hex, radix: 16)!) }
func bits(_ v: JSONValue?) -> Double { bits(v!.stringValue!) }

func bitsHex(_ x: Double) -> String { String(x.bitPattern, radix: 16).leftPadded(16) }

extension String {
    func leftPadded(_ n: Int) -> String { count >= n ? self : String(repeating: "0", count: n - count) + self }
}

extension JSONValue {
    subscript(index: Int) -> JSONValue { arrayValue![index] }
    var array: [JSONValue] { arrayValue ?? [] }
    var int: Int { Int(doubleValue!) }
    var double: Double { doubleValue! }
    var string: String { stringValue! }
    var bool: Bool { boolValue! }

    /// Re-decode a fragment into a typed value.
    func decoded<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(self))
    }

    func strippingNulls() -> JSONValue {
        switch self {
        case .array(let a): return .array(a.map { $0.strippingNulls() })
        case .object(let o): return .object(o.compactMapValues { $0 == .null ? nil : $0.strippingNulls() })
        default: return self
        }
    }
}

/// sha256 of the canonical JSON of an encodable value with nulls dropped (the exporter's `digest`).
func digest<T: Encodable>(_ value: T) throws -> String {
    let v = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    return sha256(canonicalJson(v.strippingNulls()))
}

/// The exporter's compact card: [state, due, lastReview, S, D, scheduledDays, learningSteps, reps, lapses, provisional].
struct CompactCard: Equatable, CustomStringConvertible {
    var state: Int, due: Int, lastReview: Int?, stability: Double, difficulty: Double
    var scheduledDays: Int, learningSteps: Int, reps: Int, lapses: Int, provisional: Bool

    init(_ v: JSONValue) {
        state = v[0].int; due = v[1].int; lastReview = v[2] == .null ? nil : v[2].int
        stability = v[3].double; difficulty = v[4].double; scheduledDays = v[5].int; learningSteps = v[6].int
        reps = v[7].int; lapses = v[8].int; provisional = v[9].int == 1
    }

    init(_ c: Card) {
        state = c.state.rawValue; due = c.due; lastReview = c.lastReview; stability = c.stability; difficulty = c.difficulty
        scheduledDays = c.scheduledDays; learningSteps = c.learningSteps; reps = c.reps; lapses = c.lapses; provisional = c.provisional
    }

    /// Integers exactly; stability and difficulty to 1e-9 (see FSRSConformanceTests).
    func matches(_ o: CompactCard) -> Bool {
        state == o.state && due == o.due && lastReview == o.lastReview && scheduledDays == o.scheduledDays
            && learningSteps == o.learningSteps && reps == o.reps && lapses == o.lapses && provisional == o.provisional
            && abs(stability - o.stability) <= 1e-9 && abs(difficulty - o.difficulty) <= 1e-9
    }

    var description: String {
        "[s\(state) due \(due) last \(lastReview.map(String.init) ?? "-") S \(stability) D \(difficulty) sd \(scheduledDays) step \(learningSteps) reps \(reps) lapses \(lapses) prov \(provisional)]"
    }
}

func card(id: String = "card", conceptId: String = "concept", _ c: CompactCard, courseId: String = "course", itemId: String = "item") -> Card {
    Card(id: id, courseId: courseId, itemId: itemId, conceptId: conceptId, state: CardState(rawValue: c.state)!, due: c.due,
         lastReview: c.lastReview, stability: c.stability, difficulty: c.difficulty, scheduledDays: c.scheduledDays,
         learningSteps: c.learningSteps, reps: c.reps, lapses: c.lapses, suspended: false, provisional: c.provisional)
}
