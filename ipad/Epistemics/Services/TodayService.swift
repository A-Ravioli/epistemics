import Foundation
import EpistemicsCore

/// The Today read-model (DESIGN §3.2), ported from web/apps/web/src/lib/services/today.ts.
struct TodayState {
    var day: String
    var queue: CourseService.LoadedQueue
    var warmup: Lesson?
    var nextLesson: Lesson?
    var lessonLocked: Bool
    var lockReason: String?
    var overrideUsedToday: Bool
    var recoveryMode: Bool
    var completedLessonIds: Set<String>
    var checkpoint: (unit: Unit, ready: Bool, reason: String?)?
    var mapDue: Unit?
    var remediation: [(conceptId: String, name: String)]
    var teachback: [(conceptId: String, name: String, mastery: Double)]
    var streak: Int
    var openLesson: (lessonId: String, title: String)?
    var dueCount: Int { queue.queue.dueToday }
}

extension CourseService {
    func loadToday() async throws -> TodayState {
        let day = studyDayKey()
        let queue = try await loadQueue(queueFirst: await queueFirst())
        let states = try await store.conceptStates(course: course.id)
        let mastery = states.mapValues(\.mastery)
        let completed = try await completedLessons()
        let next = nextAvailableLesson(ctx.curriculum, mastery, completed)
        let overrideUsedToday = await gateOverrideDay() == day

        var locked = false
        var reason: String?
        if queue.queue.recoveryMode {
            locked = true
            reason = "Recovery mode: the backlog is \(queue.queue.overdueDays) days old. About \(queue.queue.daysToClear) day\(queue.queue.daysToClear == 1 ? "" : "s") to clear at \(course.settings.reviewsPerDay) reviews a day."
        } else if !queue.queue.gateOpen && !overrideUsedToday {
            locked = true
            let n = queue.queue.dueToday
            reason = "\(n) review\(n == 1 ? "" : "s") to go, about \(queue.minutes) minutes by hand."
        }

        if queue.queue.dueToday == 0 && queue.cards.contains(where: { $0.state != .new }) { await markDayCleared(day) }
        let streak = Self.streak(cleared: await clearedDays(), today: day)

        // Checkpoint: the current unit fully taught and each concept retrieved in ≥2 spaced sessions.
        var checkpoint: (Unit, Bool, String?)?
        let checkpointsDone = Set(try await store.sessions(course: course.id, type: .checkpoint).filter { $0.endedAt != nil }.compactMap(\.unitId))
        for unit in ctx.curriculum.units.sorted(by: { $0.ordinal < $1.ordinal }) where !checkpointsDone.contains(unit.id) {
            guard unit.lessons.allSatisfy({ completed.contains($0.id) }) else { break }
            let short = unit.lessons.flatMap(\.concepts).filter { (states[$0.id]?.successfulSessions ?? 0) < 2 }
            checkpoint = short.isEmpty ? (unit, true, nil)
                : (unit, false, "\(short.count) concept\(short.count == 1 ? "" : "s") still need\(short.count == 1 ? "s" : "") a second spaced retrieval.")
            break
        }

        // Map from memory (DESIGN §6.6): offered once a unit has had two lessons, and not more than weekly.
        var mapDue: Unit?
        let maps = try await store.sessions(course: course.id, type: .map).filter { $0.endedAt != nil }
        for unit in ctx.curriculum.units.sorted(by: { $0.ordinal < $1.ordinal }) {
            let taught = unit.lessons.filter { completed.contains($0.id) }.count
            guard taught >= 2 else { continue }
            let last = maps.filter { $0.unitId == unit.id }.map(\.startedAt).max() ?? 0
            if now - last > 6 * 86_400_000 { mapDue = unit }
        }

        let remediation = await pendingRemediation().map { id in (id, ctx.curriculum.concept(id)?.name ?? id) }
        let teachback = states.values
            .filter { $0.mastery >= 0.6 && $0.mastery <= 0.85 }
            .sorted { $0.mastery < $1.mastery }
            .prefix(3)
            .map { ($0.conceptId, ctx.curriculum.concept($0.conceptId)?.name ?? $0.conceptId, $0.mastery) }

        let openSession = try await store.sessions(course: course.id, type: .lesson).first { $0.endedAt == nil && $0.lessonId != nil }
        let openLesson = openSession?.lessonId.map { id -> (String, String) in
            if id.hasPrefix(LessonService.remediationPrefix) {
                let cid = String(id.dropFirst(LessonService.remediationPrefix.count))
                return (id, "Going back over \(ctx.curriculum.concept(cid)?.name ?? "a concept")")
            }
            return (id, ctx.curriculum.lesson(id)?.title ?? "your lesson")
        }

        return TodayState(day: day, queue: queue, warmup: try await warmupLesson(day: day), nextLesson: next,
                          lessonLocked: locked, lockReason: reason, overrideUsedToday: overrideUsedToday,
                          recoveryMode: queue.queue.recoveryMode, completedLessonIds: completed,
                          checkpoint: checkpoint.map { (unit: $0.0, ready: $0.1, reason: $0.2) }, mapDue: mapDue,
                          remediation: remediation, teachback: Array(teachback), streak: streak, openLesson: openLesson)
    }

    /// The warm-up for today: the last finished lesson, unless the warm-up was already done today.
    func warmupLesson(day: String) async throws -> Lesson? {
        if await warmupDay() == day { return nil }
        let last = try await store.sessions(course: course.id, type: .lesson).first {
            $0.endedAt != nil && $0.lessonId.map { !$0.hasPrefix(LessonService.remediationPrefix) } == true
        }
        return last?.lessonId.flatMap { ctx.curriculum.lesson($0) }
    }

    static func streak(cleared: [String], today: String) -> Int {
        let set = Set(cleared)
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard var cursor = f.date(from: today) else { return 0 }
        if !set.contains(today) { cursor = cursor.addingTimeInterval(-86_400) }
        var n = 0
        while set.contains(f.string(from: cursor)) {
            n += 1
            cursor = cursor.addingTimeInterval(-86_400)
        }
        return n
    }
}
