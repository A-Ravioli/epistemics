import Foundation
import Synchronization
import EpistemicsCore

// Usage accounting (port of usage.ts): a sink-compatible ledger with per-role / per-model totals and today's cost,
// and the per-day budget guard (degrade the tutor to Sonnet at 80% of budget, stop at 100%).

public struct UsageTotals: Sendable, Hashable, Codable {
    public var calls = 0
    public var inputTokens = 0
    public var cacheRead = 0
    public var cacheWrite = 0
    public var outputTokens = 0
    public var costUsd = 0.0
    public var latencyMs = 0
    public init() {}

    mutating func add(_ u: Usage) {
        calls += 1; inputTokens += u.inputTokens; cacheRead += u.cacheRead; cacheWrite += u.cacheWrite
        outputTokens += u.outputTokens; costUsd += u.costUsd; latencyMs += u.latencyMs
    }
}

public struct UsageFilter: Sendable, Hashable {
    public var role: LlmRole?
    public var model: String?
    public var courseId: String?
    public var sessionId: String?
    public var sinceMs: EpochMs?
    public init(role: LlmRole? = nil, model: String? = nil, courseId: String? = nil, sessionId: String? = nil, sinceMs: EpochMs? = nil) {
        self.role = role; self.model = model; self.courseId = courseId; self.sessionId = sessionId; self.sinceMs = sinceMs
    }

    func matches(_ c: UsageCall) -> Bool {
        if let role, c.role != role { return false }
        if let model, c.usage.model != model { return false }
        if let courseId, c.courseId != courseId { return false }
        if let sessionId, c.sessionId != sessionId { return false }
        if let sinceMs, c.at < sinceMs { return false }
        return true
    }
}

/// Thread-safe usage ledger. Pass `ledger.sink` as a provider's `onUsage`.
public final class UsageLedger: Sendable {
    private let state = Mutex<[UsageCall]>([])
    private let now: @Sendable () -> EpochMs
    private let dayStartHour: Int
    private let timeZone: TimeZone
    private let retainMs: EpochMs

    /// - Parameters:
    ///   - dayStartHour: hour at which a study day starts (CourseSettings.dayStartHour). Default 4.
    ///   - retainDays: calls older than this are dropped to bound memory. Default 7.
    public init(now: @escaping @Sendable () -> EpochMs = { EpochMs(Date().timeIntervalSince1970 * 1000) },
                dayStartHour: Int = 4, timeZone: TimeZone = .current, retainDays: Int = 7) {
        self.now = now; self.dayStartHour = dayStartHour; self.timeZone = timeZone; self.retainMs = retainDays * 86_400_000
    }

    public var sink: UsageSink { { [self] call in self.record(call) } }

    public func record(_ call: UsageCall) {
        var c = call
        c.at = now()
        let cutoff = now() - retainMs
        state.withLock { calls in
            calls.append(c)
            calls.removeAll { $0.at < cutoff }
        }
    }

    public var calls: [UsageCall] { state.withLock { $0 } }

    public func totals(_ filter: UsageFilter = UsageFilter()) -> UsageTotals {
        var t = UsageTotals()
        for c in calls where filter.matches(c) { t.add(c.usage) }
        return t
    }

    public func byRole(_ filter: UsageFilter = UsageFilter()) -> [LlmRole: UsageTotals] {
        var out: [LlmRole: UsageTotals] = [:]
        for c in calls where filter.matches(c) { out[c.role, default: UsageTotals()].add(c.usage) }
        return out
    }

    public func byModel(_ filter: UsageFilter = UsageFilter()) -> [String: UsageTotals] {
        var out: [String: UsageTotals] = [:]
        for c in calls where filter.matches(c) { out[c.usage.model, default: UsageTotals()].add(c.usage) }
        return out
    }

    public func startOfToday() -> EpochMs {
        UsageLedger.startOfStudyDay(now(), dayStartHour: dayStartHour, timeZone: timeZone)
    }

    /// USD spent since the current study day started.
    public func todaysCost(_ filter: UsageFilter = UsageFilter()) -> Double {
        var f = filter
        f.sinceMs = startOfToday()
        return totals(f).costUsd
    }

    /// Load previously persisted calls (with their `at`) so today's cost survives a relaunch.
    public func load(_ loaded: [UsageCall]) {
        let cutoff = now() - retainMs
        state.withLock { calls in
            calls.append(contentsOf: loaded)
            calls.sort { $0.at < $1.at }
            calls.removeAll { $0.at < cutoff }
        }
    }

    public func clear() { state.withLock { $0.removeAll() } }

    /// Epoch ms at which the study day containing `nowMs` began (day boundary at `dayStartHour` local time).
    public static func startOfStudyDay(_ nowMs: EpochMs, dayStartHour: Int = 4, timeZone: TimeZone = .current) -> EpochMs {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let now = Date(timeIntervalSince1970: Double(nowMs) / 1000)
        var start = cal.date(bySettingHour: dayStartHour, minute: 0, second: 0, of: now) ?? now
        if start > now { start = cal.date(byAdding: .day, value: -1, to: start) ?? start }
        return EpochMs((start.timeIntervalSince1970 * 1000).rounded())
    }
}

public struct BudgetVerdict: Sendable, Hashable {
    public var allowed: Bool
    /// Set when the caller should switch this role to a cheaper model before stopping.
    public var degradeToModel: String?
    public var spentUsd: Double
    public var budgetUsd: Double
    /// spent / budget, 0...
    public var fraction: Double
}

public enum Budget {
    public static let degradeModel = "claude-sonnet-5-5"

    /// Per-day cost guard. `dailyUsd <= 0` or non-finite means unlimited. Only the tutor degrades (at `degradeAt`,
    /// default 0.8, unless it already runs on `degradeModel`); every role is blocked at 100%.
    public static func guardSpend(_ ledger: UsageLedger, dailyUsd: Double, role: LlmRole = .tutor, courseId: String? = nil,
                                  degradeAt: Double = 0.8, degradeModel: String = Budget.degradeModel,
                                  currentModel: String? = nil) -> BudgetVerdict {
        let spent = ledger.todaysCost(UsageFilter(courseId: courseId))
        guard dailyUsd.isFinite, dailyUsd > 0 else {
            return BudgetVerdict(allowed: true, spentUsd: spent, budgetUsd: dailyUsd, fraction: 0)
        }
        let fraction = spent / dailyUsd
        if fraction >= 1 { return BudgetVerdict(allowed: false, spentUsd: spent, budgetUsd: dailyUsd, fraction: fraction) }
        if role == .tutor, fraction >= degradeAt, currentModel != degradeModel {
            return BudgetVerdict(allowed: true, degradeToModel: degradeModel, spentUsd: spent, budgetUsd: dailyUsd, fraction: fraction)
        }
        return BudgetVerdict(allowed: true, spentUsd: spent, budgetUsd: dailyUsd, fraction: fraction)
    }

    /// Fan a usage call out to several sinks (ledger + database logger + UI).
    public static func combineSinks(_ sinks: UsageSink?...) -> UsageSink {
        let live = sinks.compactMap { $0 }
        return { call in for s in live { s(call) } }
    }
}
