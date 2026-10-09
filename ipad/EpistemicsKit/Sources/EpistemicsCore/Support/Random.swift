// The small seeded generators the core uses. Each returns a closure producing uniform [0, 1), like the TS.

/// Uniform [0, 1) source, as the TS `() => number`.
public typealias Rng = () -> Double

/// mulberry32 (simulate.ts): small, fast seeded PRNG.
public func mulberry32(_ seed: Int) -> Rng {
    var a = UInt32(truncatingIfNeeded: seed)
    return {
        a = a &+ 0x6D2B_79F5
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}

/// The LCG used as the queue's deterministic fallback (queue.ts `defaultRng`, seed 0x9e3779b9) and by the
/// TS tests' `seededRng(seed)`: `s = (imul(s, 1664525) + 1013904223) >>> 0`.
public func lcgRng(_ seed: UInt32) -> Rng {
    var s = seed
    return {
        s = s &* 1_664_525 &+ 1_013_904_223
        return Double(s) / 4_294_967_296
    }
}

/// TS test helper name (`seededRng(seed = 42)`).
public func seededRng(_ seed: Int = 42) -> Rng { lcgRng(UInt32(truncatingIfNeeded: seed)) }
