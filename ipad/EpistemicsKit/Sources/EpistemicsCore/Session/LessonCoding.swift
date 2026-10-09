// JSON coding for the lesson's event and effect unions, in the web's `{ "type": "snake_case", ... }` shape,
// so persisted sessions and the conformance fixtures read the same in both apps.

struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

extension KeyedDecodingContainer where K == AnyKey {
    func get<T: Decodable>(_ key: String, as: T.Type = T.self) throws -> T { try decode(T.self, forKey: AnyKey(key)) }
    func opt<T: Decodable>(_ key: String, as: T.Type = T.self) throws -> T? { try decodeIfPresent(T.self, forKey: AnyKey(key)) }
}

extension KeyedEncodingContainer where K == AnyKey {
    mutating func put<T: Encodable>(_ key: String, _ value: T) throws { try encode(value, forKey: AnyKey(key)) }
    mutating func putIfPresent<T: Encodable>(_ key: String, _ value: T?) throws { try encodeIfPresent(value, forKey: AnyKey(key)) }
}

struct UnknownTypeError: Error, CustomStringConvertible {
    var type: String
    var description: String { "unknown union member type \"\(type)\"" }
}

extension LessonEvent: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "start": self = .start
        case "learner_turn": self = .learnerTurn(content: try c.get("content"), confidence: try c.opt("confidence"))
        case "tutor_turn": self = .tutorTurn(content: try c.get("content"))
        case "observer": self = .observer(try c.get("result"))
        case "grade": self = .grade(itemKind: try c.get("itemKind"), itemId: try c.get("itemId"), grade: try c.get("grade"), rating: try c.get("rating"))
        case "give_up": self = .giveUp
        case "summary_submitted": self = .summarySubmitted(text: try c.get("text"))
        case "jol_submitted": self = .jolSubmitted(predictions: try c.get("predictions"))
        case "leak_detected": self = .leakDetected
        default: throw UnknownTypeError(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case .start: try c.put("type", "start")
        case let .learnerTurn(content, confidence):
            try c.put("type", "learner_turn"); try c.put("content", content); try c.putIfPresent("confidence", confidence)
        case .tutorTurn(let content): try c.put("type", "tutor_turn"); try c.put("content", content)
        case .observer(let r): try c.put("type", "observer"); try c.put("result", r)
        case let .grade(itemKind, itemId, grade, rating):
            try c.put("type", "grade"); try c.put("itemKind", itemKind); try c.put("itemId", itemId)
            try c.put("grade", grade); try c.put("rating", rating)
        case .giveUp: try c.put("type", "give_up")
        case .summarySubmitted(let text): try c.put("type", "summary_submitted"); try c.put("text", text)
        case .jolSubmitted(let p): try c.put("type", "jol_submitted"); try c.put("predictions", p)
        case .leakDetected: try c.put("type", "leak_detected")
        }
    }
}

extension LessonEffect: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        let type: String = try c.get("type")
        switch type {
        case "call_tutor": self = .callTutor(control: try c.get("control"))
        case "call_observer":
            self = .callObserver(learnerTurn: try c.get("learnerTurn"), conceptId: try c.get("conceptId"), objectiveIds: try c.get("objectiveIds"))
        case "grade_item": self = .gradeItem(try GradeItemEffect(from: decoder))
        case "record_receipt": self = .recordReceipt(try RecordReceiptEffect(from: decoder))
        case "activate_items": self = .activateItems(conceptId: try c.get("conceptId"), firstRating: try c.get("firstRating"))
        case "show_message": self = .showMessage(text: try c.get("text"))
        case "request_summary": self = .requestSummary
        case "request_jol": self = .requestJol(conceptIds: try c.get("conceptIds"))
        case "schedule_remediation": self = .scheduleRemediation(conceptId: try c.get("conceptId"))
        case "lesson_complete": self = .lessonComplete(results: try c.get("results"))
        default: throw UnknownTypeError(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        switch self {
        case .callTutor(let control): try c.put("type", "call_tutor"); try c.put("control", control)
        case let .callObserver(learnerTurn, conceptId, objectiveIds):
            try c.put("type", "call_observer"); try c.put("learnerTurn", learnerTurn); try c.put("conceptId", conceptId)
            try c.put("objectiveIds", objectiveIds)
        case .gradeItem(let e): try c.put("type", "grade_item"); try e.encode(to: encoder)
        case .recordReceipt(let e): try c.put("type", "record_receipt"); try e.encode(to: encoder)
        case let .activateItems(conceptId, firstRating):
            try c.put("type", "activate_items"); try c.put("conceptId", conceptId); try c.put("firstRating", firstRating)
        case .showMessage(let text): try c.put("type", "show_message"); try c.put("text", text)
        case .requestSummary: try c.put("type", "request_summary")
        case .requestJol(let ids): try c.put("type", "request_jol"); try c.put("conceptIds", ids)
        case .scheduleRemediation(let id): try c.put("type", "schedule_remediation"); try c.put("conceptId", id)
        case .lessonComplete(let results): try c.put("type", "lesson_complete"); try c.put("results", results)
        }
    }
}
