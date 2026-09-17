/**
 * Epistemics domain model.
 *
 * Two halves:
 *  - CONTENT (Curriculum → Unit → Lesson → Concept → Item): immutable, versioned, shelvable.
 *    No learner state ever lives here.
 *  - LEARNER STATE (Course, CardState, ConceptState, Session, Receipt…): keyed to content ids.
 *
 * All ids are UUIDv7 strings. All timestamps are epoch milliseconds (UTC).
 */

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export type Bloom = 'remember' | 'understand' | 'apply' | 'analyze';

export type ItemType =
  | 'recall'       // front → back, self-graded
  | 'cloze'        // sentence with a gap, self-graded
  | 'explain'      // "explain why/how", LLM-graded by rubric
  | 'apply'        // problem with new numbers/context, LLM-graded (+ optional exact answer)
  | 'discriminate' // contrast two confusable concepts, LLM-graded
  | 'map'          // list dependents/relations from memory, LLM-graded against edges
  | 'teachback'    // multi-turn teach-the-AI-student, graded post hoc
  | 'predict';     // "what do you expect…", self-graded after reveal

export interface Objective {
  id: string;
  bloom: Bloom;
  text: string;
}

export interface Misconception {
  tag: string;          // short stable slug, e.g. "conflates-independent-and-disjoint"
  description: string;  // what the learner believes
  remedy: string;       // what to say/ask to repair it
}

export interface Example {
  title: string;
  body: string;         // markdown; may include $latex$
  domain?: string;      // surface domain, used for variability ("finance", "genetics")
}

export interface SourceSpan {
  chunkId: string;
  quote: string;        // short verbatim quote
  page?: number;
  heading?: string;
}

export interface RubricCriterion {
  id: string;           // "c1"
  text: string;         // binary, checkable statement
  evidenceHint?: string;
}

export interface Item {
  id: string;
  conceptId: string;
  type: ItemType;
  bloom: Bloom;
  prompt: string;                       // markdown
  reference: {
    answer: string;                     // hidden from the tutor
    exact?: string;                     // optional canonical short answer for exact match
    notes?: string;
  };
  rubric: RubricCriterion[];            // empty for self-graded types
  spans: SourceSpan[];
  tags?: string[];
  generatorVersion: string;             // "hand-authored" | "architect@1.0"
  hash: string;                         // content hash of prompt+reference+rubric
}

export interface GuidingQuestion {
  question: string;
  expected: string;                     // what a good answer contains
  probesMisconception?: string;         // Misconception.tag
}

export interface ConceptScript {
  pretest: { prompt: string; isomorph: string; reference: string };
  guidingQuestions: GuidingQuestion[];  // 3-6
  workedExample: { problem: string; steps: string[] };
  transfer: { prompt: string; reference: string };
  hints: [string, string, string];      // levels 1..3; level 3 is partial worked example, never the answer
}

export interface Concept {
  id: string;
  ordinal: number;
  name: string;
  definition: string;                   // one or two sentences
  objectives: Objective[];
  misconceptions: Misconception[];
  examples: Example[];
  spans: SourceSpan[];
  script: ConceptScript;
  items: Item[];
}

export interface Lesson {
  id: string;
  ordinal: number;
  title: string;
  summary?: string;
  concepts: Concept[];                  // 3-5, in teaching order
}

export interface Unit {
  id: string;
  ordinal: number;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export type EdgeKind = 'prereq' | 'encompasses';

export interface ConceptEdge {
  from: string;                         // concept id
  to: string;                           // concept id
  kind: EdgeKind;                       // prereq: `to` requires `from`. encompasses: practising `from` implicitly practises `to`.
  weight?: number;                      // encompasses only, 0..0.5
  justification?: string;
  confidence?: number;                  // 0..1
}

export interface SourceDoc {
  id: string;
  title: string;
  kind: 'pdf' | 'epub' | 'docx' | 'md' | 'txt' | 'syllabus';
  hash: string;
  licence?: string;
  pageCount?: number;
}

export interface Chunk {
  id: string;
  sourceId: string;
  ordinal: number;
  headingPath: string[];
  pageStart?: number;
  pageEnd?: number;
  text: string;
  tokenCount: number;
  hash: string;
}

export interface CurriculumManifest {
  id: string;                           // stable across versions
  version: number;
  parentVersion?: { id: string; version: number };
  title: string;
  subject: string;
  description: string;
  level: string;                        // "intro undergraduate"
  contentHash: string;                  // sha256 of canonical JSON of units+edges
  generator: { name: string; version: string; model?: string; promptVersion?: string };
  createdAt: number;
  licence?: string;
}

export interface Curriculum {
  manifest: CurriculumManifest;
  units: Unit[];
  edges: ConceptEdge[];
  sources: SourceDoc[];
}

/** A shelvable pack is exactly a Curriculum serialised as JSON (file: *.epistemics.json). */
export type Pack = Curriculum;

// ---------------------------------------------------------------------------
// Learner state
// ---------------------------------------------------------------------------

export type Scaffolding = 'novice' | 'developing' | 'advanced';

export interface CourseGoals {
  purpose: 'understand' | 'exam' | 'apply';
  examDate?: number;
  weeklyMinutes: number;
  background?: string;
}

export interface CourseSettings {
  desiredRetention: number;   // 0.8..0.95, default 0.9
  reviewsPerDay: number;      // default 120
  maxNewItemsPerDay: number;  // default 40
  easyDays: number[];         // weekday indices 0..6 with reduced load
  dayStartHour: number;       // default 4
  timezone: string;
}

export interface Course {
  id: string;
  curriculumId: string;
  curriculumVersion: number;
  title: string;
  goals: CourseGoals;
  settings: CourseSettings;
  scaffolding: Scaffolding;
  createdAt: number;
  updatedAt: number;
}

/** FSRS card state; mirrors ts-fsrs Card with ids. */
export type CardState = 0 | 1 | 2 | 3; // New, Learning, Review, Relearning

export interface Card {
  id: string;
  courseId: string;
  itemId: string;
  conceptId: string;
  state: CardState;
  due: number;
  lastReview?: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  suspended: boolean;
  provisional: boolean;   // seeded by diagnostic, not yet confirmed by a real review
}

export type Rating = 1 | 2 | 3 | 4;           // Again, Hard, Good, Easy
export type Confidence = 1 | 2 | 3;           // guess, fairly sure, certain
export type ReviewSource = 'review' | 'lesson' | 'checkpoint' | 'teachback' | 'warmup' | 'implicit' | 'manual' | 'diagnostic';

export interface ReviewLogEntry {
  id: string;
  cardId: string;
  courseId: string;
  reviewTime: number;
  rating: Rating;
  stateBefore: CardState;
  elapsedDays: number;
  scheduledDays: number;
  stability: number;      // after review
  difficulty: number;     // after review
  durationMs?: number;
  confidence?: Confidence;
  source: ReviewSource;
  assisted: boolean;      // true if hints were visible when answered
}

export interface ConceptState {
  courseId: string;
  conceptId: string;
  mastery: number;                 // 0..1, see scheduler/mastery.ts
  successfulSessions: number;      // distinct days with ≥1 successful unaided retrieval
  lastSuccessDay?: string;         // "YYYY-MM-DD" in course-local day
  misconceptions: string[];        // recent tags, most recent first, max 5
  assistedPass: number;
  assistedN: number;
  unassistedPass: number;
  unassistedN: number;
  updatedAt: number;
}

export type SessionType = 'review' | 'lesson' | 'checkpoint' | 'diagnostic' | 'teachback' | 'warmup';

export interface Session {
  id: string;
  courseId: string;
  type: SessionType;
  lessonId?: string;
  unitId?: string;
  startedAt: number;
  endedAt?: number;
  summary?: Record<string, unknown>;
}

export interface Turn {
  id: string;
  sessionId: string;
  ordinal: number;
  role: 'tutor' | 'learner' | 'student' | 'system';
  content: string;
  phase?: LessonPhase;
  conceptId?: string;
  hintLevel?: number;
  observer?: ObserverResult;
  createdAt: number;
}

export interface GradeResult {
  criteria: { id: string; met: boolean; evidence: string }[];
  score: number;                 // 0..1
  misconceptionTags: string[];
  feedback: string;              // criterion-level, explanatory
  confidence: number;            // grader's own confidence 0..1
  samples?: number;              // how many grader samples were used (consensus deferral)
}

export interface Receipt {
  id: string;
  sessionId: string;
  courseId: string;
  itemId: string;
  conceptId: string;
  answer: string;
  confidence?: Confidence;
  grade?: GradeResult;
  rating: Rating;
  assisted: boolean;
  disputed: boolean;
  createdAt: number;
}

export interface JudgmentOfLearning {
  id: string;
  sessionId: string;
  courseId: string;
  conceptId: string;
  predictedRecall: number;       // 0..1
  actualOutcome?: boolean;
  checkedAt?: number;
  createdAt: number;
}

export interface FsrsParams {
  courseId: string;
  w: number[];
  desiredRetention: number;
  optimizedAt?: number;
  nReviews: number;
  logloss?: number;
}

export interface LlmCall {
  id: string;
  sessionId?: string;
  courseId?: string;
  role: LlmRole;
  model: string;
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Lesson engine (shared between core/session and llm/observer)
// ---------------------------------------------------------------------------

export type LessonPhase = 'PRIME' | 'PROBE' | 'DEVELOP' | 'CONSOLIDATE' | 'EXTEND' | 'CHECK' | 'REMEDIATE' | 'WRAP' | 'DONE';

export interface ObserverResult {
  attemptMade: boolean;          // did the learner actually try (not "idk", not off-topic)
  gaveUp: boolean;
  offTopic: boolean;
  objectiveProgress: { objectiveId: string; status: 'none' | 'partial' | 'met' }[];
  misconceptionTags: string[];
  keyIdeaStated: boolean;        // the concept's key idea appeared in the learner's own words
  priorKnowledgeElicited: boolean;
  stuck: boolean;                // two attempts without progress
  unsourcedClaims: string[];     // tutor claims not grounded in spans (when sources exist)
}

export type LlmRole = 'tutor' | 'observer' | 'grader' | 'architect' | 'itemwriter' | 'student' | 'leakcheck';

// ---------------------------------------------------------------------------
// Learner model summary injected into prompts
// ---------------------------------------------------------------------------

export interface LearnerModelSummary {
  goals: CourseGoals;
  scaffolding: Scaffolding;
  concepts: { id: string; name: string; mastery: number; successfulSessions: number; misconceptions: string[] }[];
  calibration: { brier: number; overconfidenceBias: number; n: number };
  recent: { lastLessonSummary?: string; openQuestions: string[] };
  preferences: { verbosity: 'terse' | 'normal'; examplesDomain?: string };
}
