// Alea PRNG (Johannes Baagøe, 2010), as vendored by ts-fsrs (src/alea.ts). ts-fsrs seeds it per review
// with "${reviewTimeMs}_${reps}_${difficulty*stability}" to draw the interval fuzz, so this must agree with
// the JS bit for bit: Mash works on UTF-16 code units with `>>> 0` truncations, `next` uses `| 0`.

struct Mash {
    private var n: Double = 4_022_871_197 // 0xefc8249d

    mutating func callAsFunction(_ data: String) -> Double {
        for unit in data.utf16 {
            n += Double(unit)
            var h = 0.02519603282416938 * n
            n = Double(jsToUint32(h))
            h -= n
            h *= n
            n = Double(jsToUint32(h))
            h -= n
            n += h * 4_294_967_296 // 2^32
        }
        return Double(jsToUint32(n)) * 2.3283064365386963e-10 // 2^-32
    }
}

public struct Alea: Sendable, Hashable {
    private var c: Double
    private var s0: Double
    private var s1: Double
    private var s2: Double

    public init(seed: String) {
        var mash = Mash()
        c = 1
        s0 = mash(" ")
        s1 = mash(" ")
        s2 = mash(" ")
        s0 -= mash(seed)
        if s0 < 0 { s0 += 1 }
        s1 -= mash(seed)
        if s1 < 0 { s1 += 1 }
        s2 -= mash(seed)
        if s2 < 0 { s2 += 1 }
    }

    /// Uniform in [0, 1).
    public mutating func next() -> Double {
        let t = 2_091_639 * s0 + c * 2.3283064365386963e-10 // 2^-32
        s0 = s1
        s1 = s2
        c = Double(jsToInt32(t))
        s2 = t - c
        return s2
    }
}
