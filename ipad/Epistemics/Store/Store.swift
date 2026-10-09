import Foundation
import EpistemicsCore

/// Local-first storage. The row shapes follow the web schema (web/docs/DESIGN.md §9.3): each table keys
/// the columns it is queried by and keeps the full record as JSON, so sync is a transport problem later.
actor Store {
    private let db: Database
    private let encoder: JSONEncoder = { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }()
    private let decoder = JSONDecoder()

    init(url: URL?) throws {
        db = try Database(url: url)
        try Self.migrate(db)
    }

    static func defaultURL() throws -> URL {
        let dir = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return dir.appendingPathComponent("epistemics.sqlite")
    }

    private static func migrate(_ db: Database) throws {
        let version = try db.query("PRAGMA user_version").first?["user_version"]?.int ?? 0
        if version < 1 {
            try db.executeScript("""
            CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE curricula(id TEXT NOT NULL, version INTEGER NOT NULL, title TEXT NOT NULL, json TEXT NOT NULL,
              PRIMARY KEY(id, version));
            CREATE TABLE courses(id TEXT PRIMARY KEY, curriculum_id TEXT NOT NULL, updated_at INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE TABLE cards(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, item_id TEXT NOT NULL, concept_id TEXT NOT NULL,
              state INTEGER NOT NULL, due INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE UNIQUE INDEX cards_course_item ON cards(course_id, item_id);
            CREATE TABLE review_log(id TEXT PRIMARY KEY, card_id TEXT NOT NULL, course_id TEXT NOT NULL,
              review_time INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE INDEX review_log_course ON review_log(course_id, review_time);
            CREATE TABLE concept_state(course_id TEXT NOT NULL, concept_id TEXT NOT NULL, json TEXT NOT NULL,
              PRIMARY KEY(course_id, concept_id));
            CREATE TABLE sessions(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, type TEXT NOT NULL, started_at INTEGER NOT NULL,
              ended_at INTEGER, json TEXT NOT NULL);
            CREATE INDEX sessions_course ON sessions(course_id, started_at);
            CREATE TABLE session_state(session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
            CREATE TABLE receipts(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, course_id TEXT NOT NULL, item_id TEXT NOT NULL,
              concept_id TEXT NOT NULL, created_at INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE INDEX receipts_item ON receipts(course_id, item_id, created_at);
            CREATE INDEX receipts_session ON receipts(session_id);
            CREATE TABLE jol(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, json TEXT NOT NULL);
            CREATE TABLE ink(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL,
              item_id TEXT, created_at INTEGER NOT NULL, drawing BLOB NOT NULL, json TEXT NOT NULL);
            CREATE INDEX ink_owner ON ink(owner_id);
            CREATE INDEX ink_course ON ink(course_id, created_at);
            CREATE TABLE reading(id TEXT PRIMARY KEY, ink_id TEXT NOT NULL, created_at INTEGER NOT NULL, json TEXT NOT NULL);
            CREATE INDEX reading_ink ON reading(ink_id, created_at);
            CREATE TABLE llm_calls(id TEXT PRIMARY KEY, role TEXT NOT NULL, model TEXT NOT NULL, cost_usd REAL NOT NULL,
              created_at INTEGER NOT NULL, json TEXT NOT NULL);
            PRAGMA user_version = 1;
            """)
        }
    }

    // MARK: - Encoding

    private func json<T: Encodable>(_ value: T) throws -> SQLValue {
        .text(String(decoding: try encoder.encode(value), as: UTF8.self))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ row: Row, column: String = "json") throws -> T {
        guard let text = row[column]?.text else { throw DatabaseError(message: "missing \(column)") }
        return try decoder.decode(type, from: Data(text.utf8))
    }

    private func decodeAll<T: Decodable>(_ type: T.Type, _ sql: String, _ params: [SQLValue] = []) throws -> [T] {
        try db.query(sql, params).map { try decode(type, $0) }
    }

    // MARK: - Settings

    func setting<T: Decodable>(_ key: String, as type: T.Type) throws -> T? {
        guard let row = try db.query("SELECT value AS json FROM settings WHERE key = ?", [.text(key)]).first else { return nil }
        return try decode(type, row)
    }

    func setSetting<T: Encodable>(_ key: String, _ value: T) throws {
        try db.execute("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                       [.text(key), try json(value)])
    }

    // MARK: - Curricula and courses

    func saveCurriculum(_ c: Curriculum) throws {
        try db.execute("INSERT OR REPLACE INTO curricula(id, version, title, json) VALUES(?, ?, ?, ?)",
                       [.text(c.manifest.id), .int(c.manifest.version), .text(c.manifest.title), try json(c)])
    }

    func curriculum(id: String, version: Int) throws -> Curriculum? {
        try decodeAll(Curriculum.self, "SELECT json FROM curricula WHERE id = ? AND version = ?", [.text(id), .int(version)]).first
    }

    func curricula() throws -> [Curriculum] {
        try decodeAll(Curriculum.self, "SELECT json FROM curricula ORDER BY title")
    }

    func saveCourse(_ c: Course) throws {
        try db.execute("INSERT OR REPLACE INTO courses(id, curriculum_id, updated_at, json) VALUES(?, ?, ?, ?)",
                       [.text(c.id), .text(c.curriculumId), .int(c.updatedAt), try json(c)])
    }

    func courses() throws -> [Course] {
        try decodeAll(Course.self, "SELECT json FROM courses ORDER BY updated_at DESC")
    }

    func course(_ id: String) throws -> Course? {
        try decodeAll(Course.self, "SELECT json FROM courses WHERE id = ?", [.text(id)]).first
    }

    // MARK: - Cards and the review log

    func saveCards(_ cards: [Card]) throws {
        try db.transaction {
            for c in cards {
                try db.execute("""
                    INSERT OR REPLACE INTO cards(id, course_id, item_id, concept_id, state, due, json) VALUES(?, ?, ?, ?, ?, ?, ?)
                    """, [.text(c.id), .text(c.courseId), .text(c.itemId), .text(c.conceptId), .int(c.state.rawValue), .int(c.due), try json(c)])
            }
        }
    }

    func cards(course: String) throws -> [Card] {
        try decodeAll(Card.self, "SELECT json FROM cards WHERE course_id = ?", [.text(course)])
    }

    func card(course: String, item: String) throws -> Card? {
        try decodeAll(Card.self, "SELECT json FROM cards WHERE course_id = ? AND item_id = ?", [.text(course), .text(item)]).first
    }

    func appendReviewLog(_ entries: [ReviewLogEntry]) throws {
        try db.transaction {
            for e in entries {
                try db.execute("INSERT OR REPLACE INTO review_log(id, card_id, course_id, review_time, json) VALUES(?, ?, ?, ?, ?)",
                               [.text(e.id), .text(e.cardId), .text(e.courseId), .int(e.reviewTime), try json(e)])
            }
        }
    }

    func reviewLog(course: String, since: EpochMs = 0) throws -> [ReviewLogEntry] {
        try decodeAll(ReviewLogEntry.self, "SELECT json FROM review_log WHERE course_id = ? AND review_time >= ? ORDER BY review_time",
                      [.text(course), .int(since)])
    }

    // MARK: - Concept state

    func saveConceptStates(_ states: [ConceptState]) throws {
        try db.transaction {
            for s in states {
                try db.execute("INSERT OR REPLACE INTO concept_state(course_id, concept_id, json) VALUES(?, ?, ?)",
                               [.text(s.courseId), .text(s.conceptId), try json(s)])
            }
        }
    }

    func conceptStates(course: String) throws -> [String: ConceptState] {
        let all = try decodeAll(ConceptState.self, "SELECT json FROM concept_state WHERE course_id = ?", [.text(course)])
        return Dictionary(all.map { ($0.conceptId, $0) }, uniquingKeysWith: { a, _ in a })
    }

    // MARK: - Sessions

    func saveSession(_ s: Session) throws {
        try db.execute("INSERT OR REPLACE INTO sessions(id, course_id, type, started_at, ended_at, json) VALUES(?, ?, ?, ?, ?, ?)",
                       [.text(s.id), .text(s.courseId), .text(s.type.rawValue), .int(s.startedAt), s.endedAt.map { .int($0) } ?? .null, try json(s)])
    }

    func sessions(course: String, type: SessionType? = nil) throws -> [Session] {
        if let type {
            return try decodeAll(Session.self, "SELECT json FROM sessions WHERE course_id = ? AND type = ? ORDER BY started_at DESC",
                                 [.text(course), .text(type.rawValue)])
        }
        return try decodeAll(Session.self, "SELECT json FROM sessions WHERE course_id = ? ORDER BY started_at DESC", [.text(course)])
    }

    func session(_ id: String) throws -> Session? {
        try decodeAll(Session.self, "SELECT json FROM sessions WHERE id = ?", [.text(id)]).first
    }

    /// Resumable reducer state for an unfinished session (a lesson, a checkpoint).
    func saveSessionState<T: Encodable>(_ sessionId: String, _ state: T) throws {
        try db.execute("INSERT OR REPLACE INTO session_state(session_id, json) VALUES(?, ?)", [.text(sessionId), try json(state)])
    }

    func sessionState<T: Decodable>(_ sessionId: String, as type: T.Type) throws -> T? {
        try decodeAll(type, "SELECT json FROM session_state WHERE session_id = ?", [.text(sessionId)]).first
    }

    func deleteSessionState(_ sessionId: String) throws {
        try db.execute("DELETE FROM session_state WHERE session_id = ?", [.text(sessionId)])
    }

    // MARK: - Receipts and judgments of learning

    func saveReceipt(_ r: Receipt) throws {
        try db.execute("""
            INSERT OR REPLACE INTO receipts(id, session_id, course_id, item_id, concept_id, created_at, json) VALUES(?, ?, ?, ?, ?, ?, ?)
            """, [.text(r.id), .text(r.sessionId), .text(r.courseId), .text(r.itemId), .text(r.conceptId), .int(r.createdAt), try json(r)])
    }

    func receipts(course: String) throws -> [Receipt] {
        try decodeAll(Receipt.self, "SELECT json FROM receipts WHERE course_id = ? ORDER BY created_at", [.text(course)])
    }

    func receipts(session: String) throws -> [Receipt] {
        try decodeAll(Receipt.self, "SELECT json FROM receipts WHERE session_id = ? ORDER BY created_at", [.text(session)])
    }

    /// The most recent earlier receipt for an item, for "You answered this 12 days ago" (DESIGN §6.4).
    func previousReceipt(course: String, item: String, before: EpochMs) throws -> Receipt? {
        try decodeAll(Receipt.self, """
            SELECT json FROM receipts WHERE course_id = ? AND item_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1
            """, [.text(course), .text(item), .int(before)]).first
    }

    func saveJOL(_ j: JudgmentOfLearning) throws {
        try db.execute("INSERT OR REPLACE INTO jol(id, course_id, json) VALUES(?, ?, ?)", [.text(j.id), .text(j.courseId), try json(j)])
    }

    // MARK: - Ink and readings

    func saveInk(_ ink: InkRecord) throws {
        try db.execute("""
            INSERT OR REPLACE INTO ink(id, course_id, owner_kind, owner_id, item_id, created_at, drawing, json) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """, [.text(ink.id), .text(ink.courseId), .text(ink.ownerKind.rawValue), .text(ink.ownerId),
                  ink.itemId.map { .text($0) } ?? .null, .int(ink.createdAt), .blob(ink.drawing), try json(ink)])
    }

    private func inkRows(_ sql: String, _ params: [SQLValue]) throws -> [InkRecord] {
        try db.query(sql, params).map { row in
            var ink = try decode(InkRecord.self, row)
            ink.drawing = row["drawing"]?.blob ?? Data()
            return ink
        }
    }

    func ink(_ id: String) throws -> InkRecord? {
        try inkRows("SELECT json, drawing FROM ink WHERE id = ?", [.text(id)]).first
    }

    func ink(owner: String) throws -> [InkRecord] {
        try inkRows("SELECT json, drawing FROM ink WHERE owner_id = ? ORDER BY created_at", [.text(owner)])
    }

    func ink(course: String) throws -> [InkRecord] {
        try inkRows("SELECT json, drawing FROM ink WHERE course_id = ? ORDER BY created_at", [.text(course)])
    }

    func saveReading(_ r: InkReading) throws {
        try db.execute("INSERT OR REPLACE INTO reading(id, ink_id, created_at, json) VALUES(?, ?, ?, ?)",
                       [.text(r.id), .text(r.inkId), .int(r.createdAt), try json(r)])
    }

    func latestReading(ink: String) throws -> InkReading? {
        try decodeAll(InkReading.self, "SELECT json FROM reading WHERE ink_id = ? ORDER BY created_at DESC LIMIT 1", [.text(ink)]).first
    }

    // MARK: - LLM usage

    func logLLMCall(id: String, role: String, model: String, costUsd: Double, at: EpochMs, details: [String: JSONValue]) throws {
        try db.execute("INSERT OR REPLACE INTO llm_calls(id, role, model, cost_usd, created_at, json) VALUES(?, ?, ?, ?, ?, ?)",
                       [.text(id), .text(role), .text(model), .double(costUsd), .int(at), try json(details)])
    }

    func llmCost(since: EpochMs) throws -> Double {
        try db.query("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_calls WHERE created_at >= ?", [.int(since)]).first?["total"]?.double ?? 0
    }
}
