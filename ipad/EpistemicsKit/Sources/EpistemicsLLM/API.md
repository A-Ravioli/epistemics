# EpistemicsLLM public API

Port of `web/packages/llm` plus the iPad Reader, observer marks and tutor ink rules. Depends on `EpistemicsCore`
(`LlmRole`, `LessonPhase`, `ObserverResult`, `GradeResult`, `RubricCriterion`, `Rating`, `ItemType`, `Paper`,
`Concept`, `Lesson`, `JSONValue`). Every type is `Sendable`. Cancellation is Swift Task cancellation (surfaces as
`LlmError(.aborted)`).

## Requests and results (Provider.swift)

```swift
enum Effort: String { case low, medium, high, xhigh, max }
struct ImageContent { var mediaType: String; var data: Data            // raw bytes; base64 on the wire
                      init(mediaType: String = "image/png", data: Data); static func png(_ data: Data) -> ImageContent }
struct ChatMessage { enum Role { case user, assistant, system }         // system = mid-conversation control message
                     var role: Role; var content: String; var images: [ImageContent]; var cache: Bool
                     static func user(_ text: String, images: [ImageContent] = [], cache: Bool = false) -> ChatMessage
                     static func assistant(_ text: String) -> ChatMessage; static func system(_ text: String) -> ChatMessage }
struct CacheableBlock { var text: String; var cache: Bool; init(_ text: String, cache: Bool = false) }
struct RequestMetadata { var sessionId: String?; var courseId: String? }
struct LlmRequest { var role: LlmRole; var model: String?; var system: [CacheableBlock]; var messages: [ChatMessage]
                    var maxTokens: Int?; var effort: Effort?; var metadata: RequestMetadata? }   // no temperature

struct Usage: Codable { var inputTokens, cacheRead, cacheWrite, outputTokens: Int; var costUsd: Double; var latencyMs: Int; var model: String
                        static let zero; static func make(model:inputTokens:outputTokens:cacheRead:cacheWrite:latencyMs:) -> Usage
                        static func + (Usage, Usage) -> Usage }
struct UsageCall: Codable { var usage: Usage; var role: LlmRole; var sessionId: String?; var courseId: String?; var at: EpochMs }
typealias UsageSink = @Sendable (UsageCall) -> Void

enum StreamEvent { case delta(String); case done(Usage, stopReason: String?) }
struct TextResult { var text: String; var usage: Usage; var stopReason: String? }
struct Structured<T> { var value: T; var usage: Usage }               // usage summed over retries

protocol LLMProvider: Sendable {
    var name: String { get }
    func stream(_ request: LlmRequest) -> AsyncThrowingStream<StreamEvent, any Error>
    func text(_ request: LlmRequest) async throws -> TextResult
    func structured<T: Decodable & Sendable>(_ request: LlmRequest, schema: JSONSchema, name: String) async throws -> Structured<T>
}
extension LLMProvider {
    func structured<T>(_ request: LlmRequest, schema: JSONSchema, name: String, as: T.Type) async throws -> Structured<T>
    func streamText(_ request: LlmRequest, onText: (@Sendable (String) -> Void)? = nil) async throws -> TextResult  // onText gets the accumulated text
}

struct LlmError: Error { enum Kind { case refusal, rateLimit, connection, status, parse, aborted, unknown }
                         var kind: Kind; var message: String; var status: Int?; var retryable: Bool
                         var refusalCategory: String?; var refusalExplanation: String?; var usage: Usage?
                         static func classify(_ e: any Error) -> LlmError }

struct ModelConfig: Codable { var tutor, observer, grader, architect, itemwriter, student, leakcheck, reader: String
                              static let defaults; subscript(role: LlmRole) -> String { get set } }
// defaults: tutor/architect claude-opus-5-5; grader/student/reader/itemwriter claude-sonnet-5-5; observer/leakcheck claude-haiku-5-5
func defaultEffort(for role: LlmRole) -> Effort        // tutor/grader/reader/itemwriter medium, observer/student/leakcheck low, architect high
func defaultMaxTokens(role: LlmRole, structured: Bool) -> Int
struct ModelPrice { var input, output, cacheRead, cacheWrite: Double }  // USD / Mtok
enum Pricing { static let prices: [String: ModelPrice]; static func cost(model:inputTokens:outputTokens:cacheRead:cacheWrite:) -> Double }
```

## JSON (OrderedJSON.swift, JSONSchema.swift)

```swift
indirect enum OrderedJSON: Hashable { case null, bool(Bool), int(Int), double(Double), string(String), array([OrderedJSON]), object([(String, OrderedJSON)])
    func serialized() -> String; func prettySerialized() -> String; var data: Data; subscript(key: String) -> OrderedJSON?
    init(_ v: JSONValue); var jsonValue: JSONValue }
struct JSONSchema { let json: OrderedJSON; init(raw: OrderedJSON)
    static let string, number, integer, boolean: JSONSchema
    static func enumeration(_ values: [String]) -> JSONSchema; static func array(_ items: JSONSchema) -> JSONSchema
    static func object(_ properties: KeyValuePairs<String, JSONSchema>) -> JSONSchema  // all required, additionalProperties false
    static func nullable(_ inner: JSONSchema) -> JSONSchema; func described(_ text: String) -> JSONSchema }
```

## Providers

```swift
struct AnthropicProvider: LLMProvider {
    struct Options { var apiKey: String?                 // nil = no x-api-key (proxy injects it)
                     var baseURL: URL                    // default https://api.anthropic.com; "/v1/messages" appended
                     var models: ModelConfig; var onUsage: UsageSink?
                     var retryDelay: Duration = .milliseconds(1500); var cacheTTL: CacheTTL = .oneHour; var timeout: TimeInterval = 600
                     var serverSideFallbacks: Bool = true // fallbacks:"default" + beta header, Opus 5.5 / Sonnet 5.5 only
                     var extraHeaders: (@Sendable () async throws -> [String: String])?   // e.g. Supabase bearer token
                     var session: URLSession = .shared }
    init(options: Options = Options())
    init(apiKey: String?, baseURL: URL = …, models: ModelConfig = .defaults, onUsage: UsageSink? = nil)
    let options: Options; func model(for role: LlmRole) -> String
}
enum CacheTTL: String { case fiveMinutes = "5m", oneHour = "1h" }
func supportsMidSystem(_ model: String) -> Bool
func supportsServerSideFallback(_ model: String) -> Bool
let maxCacheBreakpoints: Int   // 4

final class MockProvider: LLMProvider {                  // the offline "Demo tutor"
    struct Script { var queue: [LlmRole: [MockResponse]]; var respond: (@Sendable (LlmRequest) -> MockResponse?)?
                    var model: String = "mock"; var onUsage: UsageSink?; var delay: Duration = .zero; var latencyMs: Int = 0 }
    init(_ script: Script = Script()); var calls: [LlmRequest]; func push(_ role: LlmRole, _ responses: MockResponse...); func reset()
}
enum MockResponse: ExpressibleByStringLiteral { case text(String), json(JSONValue), dynamic(@Sendable (LlmRequest) -> MockResponse)
                                                static func value<E: Encodable>(_ v: E) -> MockResponse }
enum MockHeuristics { static let defaultTutorText, defaultStudentText: String
    static func attemptMade(_ learnerText: String) -> Bool
    static func observe(learnerTurn:tutorTurnBefore:concept:previousTurnNoProgress:) -> ObserverResult
    static func mark(learnerTurn:observation:marksAllowed:) -> TutorMark?
    static func grade(answer:reference:rubricIds:misconceptions:) -> GradeResult
    static func warmup(dump:concepts:) -> WarmupResult
    static func read(draft: String) -> ReaderOutput }   // ~~x~~ crossed out, \boxed{x}, "a -> b [: label]" lines, "?" tokens uncertain
```

## Roles

```swift
// Tutor (Roles/Tutor.swift)
struct TutorTurnControl { var phase: LessonPhase; var conceptId: String; var hintLevel: Int; var maxWords: Int; var instruction: String
                          var allowHintContent: Bool?; var objectiveId: String?; var revealAllowed: Bool = false; var markedQuote: String? }
struct TutorInput { var charter: String?  /* default Prompts.tutorCharterInk */; var curriculumContext: String; var learnerModelText: String
                    var transcript: [ChatMessage]; var control: TutorTurnControl; var model: String?; var effort: Effort?; var maxTokens: Int?; var metadata: RequestMetadata? }
struct CurriculumContextOptions { var spans: [SourceSpan] = []; var sourcesLoaded: Bool?; var includeOtherConcepts = true }
enum TutorTurnOutcome { case turn(text: String, usage: Usage, shape: TurnShape, regenerated: Bool)
                        case leaked(text: String, verdict: LeakVerdict, usage: Usage) }
enum TutorError: Error { case referenceLeaked([String]), lessonHasNoConcepts }
enum Tutor {
    static func renderControl(_ c: TutorTurnControl) -> String
    static func buildRequest(_ input: TutorInput) -> LlmRequest
    static func buildCurriculumContext(_ lesson: Lesson, focusConceptId: String, options: CurriculumContextOptions = .init()) throws -> String
    static func hiddenReferences(_ lesson: Lesson) -> [String]
    static func referenceLeaks(_ text: String, lesson: Lesson) -> [String]
    static func leakReferences(for concept: Concept?, phase: LessonPhase) -> [LeakReference]
    static func runTurn(_ provider: any LLMProvider, input: TutorInput, leakReferences: [LeakReference],
                        leakProvider: (any LLMProvider)? = nil, onText: (@Sendable (String) -> Void)? = nil) async throws -> TutorTurnOutcome
}

// Leak / turn shape (Roles/Leak.swift)
struct LeakReference: Codable { var answer: String; var exact: String? }
struct LeakVerdict { enum Reason { case exact, phrase, model, none, inconclusive }; var leaked: Bool; var reason: Reason; var detail: String? }
struct LeakCheckResult: Codable { var leaked: Bool; var reason: String }
struct TurnShape { var ok: Bool; var questions: Int; var words: Int }
enum Leak { static let phraseWindow, inconclusiveMinWords: Int; static let inconclusiveOverlap: Double; static let schema: JSONSchema
    static func heuristic(_ tutorText: String, reference: LeakReference) -> LeakVerdict
    static func buildRequest(_ tutorText: String, reference: LeakReference, model: String? = nil, metadata: RequestMetadata? = nil) -> LlmRequest
    static func detect(_ tutorText: String, reference: LeakReference, provider: (any LLMProvider)? = nil, metadata: RequestMetadata? = nil) async throws -> LeakVerdict
    static func checkTurnShape(_ text: String, maxWords: Int) -> TurnShape }

// Observer (Roles/Observer.swift)
struct ObserverConcept { struct Objective { id, text: String; bloom: String? }; struct Misconception { tag, description: String }
                         var name, definition: String; var objectives: [Objective]; var misconceptions: [Misconception]; init(_ c: Concept) }
struct ObserveInput { var learnerTurn, tutorTurnBefore: String; var concept: ObserverConcept; var sourcesLoaded: Bool
                      var previousTurnNoProgress: Bool?; var model: String?; var metadata: RequestMetadata? }
struct InkSummary: Codable { var secondsToFirstStroke: Double?; var secondsWriting: Double?; var crossedOut: [String]; var drewDiagram: Bool }
struct InkObserveInput { var base: ObserveInput; var phase: LessonPhase; var ink: InkSummary?; var marksAllowed: Bool { get } }
struct TutorMark: Codable { var quote: String; var note: String? }
@dynamicMemberLookup struct InkObserverResult: Codable { var observation: ObserverResult; var mark: TutorMark? }  // r.attemptMade works
enum Observer { static let schema, inkSchema, markSchema: JSONSchema; static let maxNoteWords = 8
    static func buildRequest(_ input: ObserveInput) -> LlmRequest; static func buildRequest(_ input: InkObserveInput) -> LlmRequest
    static func sanitise(_ r: ObserverResult, concept: ObserverConcept) -> ObserverResult
    static func sanitiseMark(_ mark: TutorMark?, learnerTurn: String, phase: LessonPhase, attemptMade: Bool) -> TutorMark?
    static func observe(_ provider: any LLMProvider, _ input: ObserveInput) async throws -> Structured<ObserverResult>
    static func observe(_ provider: any LLMProvider, _ input: InkObserveInput) async throws -> Structured<InkObserverResult> }

// Grader (Roles/Grader.swift)
struct GradeReference: Codable { var answer: String; var exact: String?; var notes: String?; init(_ r: ItemReference) }
struct GradeInput { var prompt: String; var reference: GradeReference; var rubric: [RubricCriterion]; var answer: String
                    var misconceptions: [GradeInput.Misconception]; var samples: Int?; var consensusConfidence: Double = 0.7
                    var model: String?; var metadata: RequestMetadata? }
struct GradeOutcome { var grade: GradeResult; var usage: Usage; var disagreement: Bool }
enum Grader { static let ratingBoundaries: [Double]; static let consensusConfidence, consensusMargin: Double; static let consensusSamples: Int
    static let schema: JSONSchema
    static func buildRequest(_ input: GradeInput) -> LlmRequest
    static func exactMatches(_ answer: String, exact: String) -> Bool
    static func gradeExact(_ answer: String, exact: String, rubric: [RubricCriterion] = []) -> GradeResult
    static func needsConsensus(score: Double, confidence: Double, confidenceBar: Double = 0.7) -> Bool
    static func combine(_ samples: [GradeResult], rubric: [RubricCriterion]) -> GradeResult
    static func rating(score: Double, confidence: Double) -> Rating
    static func samplesDisagree(_ samples: [GradeResult]) -> Bool
    static func sanitise(_ g: GradeResult, rubric: [RubricCriterion], misconceptionTags: [String]) -> GradeResult
    static func grade(_ provider: any LLMProvider, _ input: GradeInput) async throws -> GradeOutcome }

// Student (Roles/Student.swift)
struct StudentTurnControl { var poseWrongBelief = false; var wrongBelief: String?; var askForExample = false; var maxWords = 80; var instruction: String?; var turn: Int? }
struct StudentObjective { var id, text: String }
struct StudentInput { var conceptName, definition: String; var objectives: [StudentObjective]; var transcript: [ChatMessage]
                      var control: StudentTurnControl; var model: String?; var effort: Effort?; var maxTokens: Int?; var metadata: RequestMetadata? }
enum Student { static func renderControl(_ c: StudentTurnControl) -> String; static func buildRequest(_ input: StudentInput) -> LlmRequest }

// Warm-up (Roles/Warmup.swift)
struct WarmupConcept: Codable { var id, name, definition: String }
struct WarmupInput { var dump: String; var concepts: [WarmupConcept]; var model: String?; var metadata: RequestMetadata? }
struct WarmupResult: Codable { var recalledConceptIds: [String]; var partial: [String] }
enum Warmup { static let schema: JSONSchema; static func buildRequest(_ input: WarmupInput) -> LlmRequest
    static func sanitise(_ r: WarmupResult, concepts: [WarmupConcept]) -> WarmupResult
    static func grade(_ provider: any LLMProvider, _ input: WarmupInput) async throws -> Structured<WarmupResult> }

// Reader (Roles/Reader.swift) — input has no reference/rubric/misconception fields by construction
struct ReaderInput { let image: Data /* PNG */; let draft: String; let itemType: ItemType; let paper: Paper; let prompt: String
                     var model: String?; var metadata: RequestMetadata? }
struct ReaderOutput: Codable { struct Node { var id, label: String }; struct Edge { var from, to: String; var label: String? }
                               struct Diagram { var nodes: [Node]; var edges: [Edge] }; struct Uncertain { var span: String; var alternatives: [String] }
                               var text: String; var boxed: String?; var diagram: Diagram?; var crossedOut: [String]; var uncertain: [Uncertain]
                               var hasDoubt: Bool { get } }
enum Reader { static let schema: JSONSchema; static func buildRequest(_ input: ReaderInput) -> LlmRequest
    static func sanitise(_ r: ReaderOutput) -> ReaderOutput
    static func read(_ provider: any LLMProvider, _ input: ReaderInput) async throws -> Structured<ReaderOutput> }

// Shared input convention (Roles/Shared.swift)
enum RoleInput { static func encode(_ input: OrderedJSON) -> String; static func decode<T: Decodable>(_ req: LlmRequest, as: T.Type) -> T?
                 static func jsonText(_ req: LlmRequest) -> String?; static func lastUserText(_ req: LlmRequest) -> String
                 static func lastControlText(_ req: LlmRequest) -> String }
```

## Prompts, text, usage

```swift
enum PromptName: String, CaseIterable { case tutorCharter, observer, grader, student, leakcheck, warmup, architectOutline, architectConcepts,
    architectGraph, architectScripts, architectItems, architectItemcheck, reader, observerInk, tutorInk
    var fileName: String; var isIPadOnly: Bool }
enum Prompts { static func text(_ name: PromptName) -> String; static func body(_ name: PromptName) -> String  // without version line
    static func version(_ name: PromptName) -> String; static func version(of text: String) -> String; static var versions: [PromptName: String]
    static var tutorCharter, observer, grader, student, leakcheck, warmup, reader, observerInk, tutorInk: String
    static var tutorCharterInk: String; static var observerWithInk: String }

enum TextUtil { static func normalise(_:) -> String; static func words(_:) -> [String]; static func stem(_:) -> String
    static func contentWords(_:) -> [String]; static func isStopword(_:) -> Bool; static func stripCode(_:) -> String
    static func wordCount(_:) -> Int; static func splitDeltas(_:) -> [String]; static func sharedContentWords(_:_:) -> Int
    static func questionCount(_:) -> Int }

final class UsageLedger { init(now: @escaping @Sendable () -> EpochMs = …, dayStartHour: Int = 4, timeZone: TimeZone = .current, retainDays: Int = 7)
    var sink: UsageSink; func record(_ call: UsageCall); var calls: [UsageCall]
    func totals(_ f: UsageFilter = .init()) -> UsageTotals; func byRole(_:) -> [LlmRole: UsageTotals]; func byModel(_:) -> [String: UsageTotals]
    func startOfToday() -> EpochMs; func todaysCost(_ f: UsageFilter = .init()) -> Double; func load(_ calls: [UsageCall]); func clear()
    static func startOfStudyDay(_ nowMs: EpochMs, dayStartHour: Int = 4, timeZone: TimeZone = .current) -> EpochMs }
struct UsageFilter { var role: LlmRole?; var model, courseId, sessionId: String?; var sinceMs: EpochMs? }
struct UsageTotals: Codable { var calls, inputTokens, cacheRead, cacheWrite, outputTokens: Int; var costUsd: Double; var latencyMs: Int }
struct BudgetVerdict { var allowed: Bool; var degradeToModel: String?; var spentUsd, budgetUsd, fraction: Double }
enum Budget { static let degradeModel = "claude-sonnet-5-5"
    static func guardSpend(_ ledger: UsageLedger, dailyUsd: Double, role: LlmRole = .tutor, courseId: String? = nil, degradeAt: Double = 0.8,
                           degradeModel: String = …, currentModel: String? = nil) -> BudgetVerdict
    static func combineSinks(_ sinks: UsageSink?...) -> UsageSink }
```
