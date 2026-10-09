import Foundation

// Course-local "study day" helpers (time.ts). The day boundary defaults to 04:00 local, matching the FSRS
// optimizer convention. The web reads wall-clock fields through Intl.DateTimeFormat; here the same instant
// is shifted by the zone's UTC offset at that instant and converted to a civil date, which is what Intl does.

public struct DayConfig: Codable, Sendable, Hashable {
    public var timezone: String
    public var dayStartHour: Int
    public init(timezone: String, dayStartHour: Int) { self.timezone = timezone; self.dayStartHour = dayStartHour }
}

public extension CourseSettings {
    var dayConfig: DayConfig { DayConfig(timezone: timezone, dayStartHour: dayStartHour) }
}

public let dayMs: Int = 86_400_000
/// TS name, kept so the two codebases read alike.
public let DAY_MS: Int = dayMs

@inline(__always) func floorDiv(_ a: Int, _ b: Int) -> Int {
    let q = a / b
    return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
}

@inline(__always) func floorMod(_ a: Int, _ b: Int) -> Int { a - floorDiv(a, b) * b }

/// Unknown identifiers fall back to UTC (Intl would throw a RangeError).
func resolveTimeZone(_ identifier: String) -> TimeZone {
    TimeZone(identifier: identifier) ?? TimeZone(identifier: "UTC")!
}

/// Seconds east of UTC in `timezone` at the instant `at`.
func tzOffsetSeconds(_ at: EpochMs, _ timezone: String) -> Int {
    let date = Date(timeIntervalSince1970: Double(floorDiv(at, 1000)))
    return resolveTimeZone(timezone).secondsFromGMT(for: date)
}

/// Days since 1970-01-01 → (year, month, day), proleptic Gregorian (Hinnant's civil_from_days).
func civilFromDays(_ z0: Int) -> (year: Int, month: Int, day: Int) {
    let z = z0 + 719_468
    let era = floorDiv(z, 146_097)
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp < 10 ? mp + 3 : mp - 9
    return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
}

/// (year, month 1...12, day) → days since 1970-01-01 (`Date.UTC(y, m - 1, d) / DAY_MS`).
func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
    let y = m <= 2 ? y0 - 1 : y0
    let era = floorDiv(y, 400)
    let yoe = y - era * 400
    let doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
}

/// Returns "YYYY-MM-DD" of the study day containing `at` under the config.
public func studyDay(_ at: EpochMs, _ cfg: DayConfig) -> String {
    let shifted = at - cfg.dayStartHour * 3_600_000
    let local = shifted + tzOffsetSeconds(shifted, cfg.timezone) * 1000
    let (y, m, d) = civilFromDays(floorDiv(local, dayMs))
    let year = y >= 0 && y < 10000 ? String(format: "%04d", y) : String(y)
    return "\(year)-\(String(format: "%02d", m))-\(String(format: "%02d", d))"
}

/// Epoch ms of the start of the study day containing `at`.
public func studyDayStart(_ at: EpochMs, _ cfg: DayConfig) -> EpochMs {
    let parts = studyDay(at, cfg).split(separator: "-").compactMap { Int($0) }
    // Local midnight of that date in the timezone, then add dayStartHour; the offset is taken at the
    // instant `guess` (a UTC wall time), exactly as the web does.
    let guess = daysFromCivil(parts[0], parts[1], parts[2]) * dayMs + cfg.dayStartHour * 3_600_000
    return guess - tzOffsetSeconds(guess, cfg.timezone) * 1000
}

/// Minutes east of UTC at `at`. Like the web, the wall clock is read to the second, so a non-whole-second
/// `at` yields a fractional result.
public func tzOffsetMinutes(_ at: EpochMs, _ timezone: String) -> Double {
    Double(tzOffsetSeconds(at, timezone)) / 60 - Double(floorMod(at, 1000)) / 60_000
}

public func daysBetween(_ a: EpochMs, _ b: EpochMs) -> Int {
    Int(jsRound(Double(b - a) / Double(dayMs)))
}
