import { sqliteTable, text, integer, real, customType, index, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Raw bytes column. drizzle's `blob()` (buffer mode) maps values through Node's `Buffer`, which does not exist
 * in the browser; every executor here already returns blobs as Uint8Array, so pass them through untouched.
 */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'blob',
  toDriver: (v) => v,
  fromDriver: (v) => (v instanceof Uint8Array ? v : new Uint8Array(v as ArrayBufferLike)),
});

const ts = () => integer('created_at').notNull();
const upd = () => integer('updated_at').notNull();
const del = () => integer('deleted_at');

// ---------------- content ----------------
export const curricula = sqliteTable('curricula', {
  id: text('id').notNull(),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  subject: text('subject').notNull(),
  contentHash: text('content_hash').notNull(),
  manifestJson: text('manifest_json').notNull(),
  curriculumJson: text('curriculum_json').notNull(),   // full Curriculum, the source of truth for content
  frozenAt: integer('frozen_at'),
  createdAt: ts(), updatedAt: upd(), deletedAt: del(),
}, (t) => [primaryKey({ columns: [t.id, t.version] })]);

export const concepts = sqliteTable('concepts', {
  id: text('id').primaryKey(),
  curriculumId: text('curriculum_id').notNull(),
  curriculumVersion: integer('curriculum_version').notNull(),
  unitId: text('unit_id').notNull(),
  lessonId: text('lesson_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  name: text('name').notNull(),
  json: text('json').notNull(),
}, (t) => [index('concepts_curr').on(t.curriculumId, t.curriculumVersion)]);

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  conceptId: text('concept_id').notNull(),
  curriculumId: text('curriculum_id').notNull(),
  curriculumVersion: integer('curriculum_version').notNull(),
  type: text('type').notNull(),
  bloom: text('bloom').notNull(),
  hash: text('hash').notNull(),
  json: text('json').notNull(),
}, (t) => [index('items_concept').on(t.conceptId)]);

export const conceptEdges = sqliteTable('concept_edges', {
  id: text('id').primaryKey(),
  curriculumId: text('curriculum_id').notNull(),
  curriculumVersion: integer('curriculum_version').notNull(),
  fromId: text('from_id').notNull(),
  toId: text('to_id').notNull(),
  kind: text('kind').notNull(),
  weight: real('weight'),
  justification: text('justification'),
  confidence: real('confidence'),
}, (t) => [index('edges_curr').on(t.curriculumId, t.curriculumVersion)]);

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  curriculumId: text('curriculum_id'),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  hash: text('hash').notNull(),
  licence: text('licence'),
  pageCount: integer('page_count'),
  createdAt: ts(),
});

export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  headingPath: text('heading_path').notNull(),   // JSON array
  pageStart: integer('page_start'),
  pageEnd: integer('page_end'),
  text: text('text').notNull(),
  tokenCount: integer('token_count').notNull(),
  hash: text('hash').notNull(),
  embedding: bytes('embedding'),                 // Float32Array bytes
}, (t) => [index('chunks_source').on(t.sourceId, t.ordinal)]);

export const genCache = sqliteTable('gen_cache', {
  key: text('key').primaryKey(),                  // sha256(inputHash + promptVersion + model + kind)
  kind: text('kind').notNull(),
  json: text('json').notNull(),
  createdAt: ts(),
});

// ---------------- learner ----------------
export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  curriculumId: text('curriculum_id').notNull(),
  curriculumVersion: integer('curriculum_version').notNull(),
  title: text('title').notNull(),
  goalsJson: text('goals_json').notNull(),
  settingsJson: text('settings_json').notNull(),
  scaffolding: text('scaffolding').notNull(),
  createdAt: ts(), updatedAt: upd(), deletedAt: del(),
});

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  itemId: text('item_id').notNull(),
  conceptId: text('concept_id').notNull(),
  state: integer('state').notNull().default(0),
  due: integer('due').notNull(),
  lastReview: integer('last_review'),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  learningSteps: integer('learning_steps').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  suspended: integer('suspended').notNull().default(0),
  provisional: integer('provisional').notNull().default(0),
  updatedAt: upd(),
}, (t) => [index('cards_course_due').on(t.courseId, t.due), index('cards_item').on(t.courseId, t.itemId)]);

export const reviewLog = sqliteTable('review_log', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  courseId: text('course_id').notNull(),
  reviewTime: integer('review_time').notNull(),
  rating: integer('rating').notNull(),
  stateBefore: integer('state_before').notNull(),
  elapsedDays: integer('elapsed_days').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  durationMs: integer('duration_ms'),
  confidence: integer('confidence'),
  source: text('source').notNull(),
  assisted: integer('assisted').notNull().default(0),
}, (t) => [index('rl_card').on(t.cardId, t.reviewTime), index('rl_course').on(t.courseId, t.reviewTime)]);

export const conceptState = sqliteTable('concept_state', {
  courseId: text('course_id').notNull(),
  conceptId: text('concept_id').notNull(),
  mastery: real('mastery').notNull().default(0),
  successfulSessions: integer('successful_sessions').notNull().default(0),
  lastSuccessDay: text('last_success_day'),
  misconceptionsJson: text('misconceptions_json').notNull().default('[]'),
  assistedPass: integer('assisted_pass').notNull().default(0),
  assistedN: integer('assisted_n').notNull().default(0),
  unassistedPass: integer('unassisted_pass').notNull().default(0),
  unassistedN: integer('unassisted_n').notNull().default(0),
  updatedAt: upd(),
}, (t) => [primaryKey({ columns: [t.courseId, t.conceptId] })]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  type: text('type').notNull(),
  lessonId: text('lesson_id'),
  unitId: text('unit_id'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  summaryJson: text('summary_json'),
  stateJson: text('state_json'),                   // serialised engine state for resume
}, (t) => [index('sessions_course').on(t.courseId, t.startedAt)]);

export const turns = sqliteTable('turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  phase: text('phase'),
  conceptId: text('concept_id'),
  hintLevel: integer('hint_level'),
  observerJson: text('observer_json'),
  createdAt: ts(),
}, (t) => [index('turns_session').on(t.sessionId, t.ordinal)]);

export const receipts = sqliteTable('receipts', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  courseId: text('course_id').notNull(),
  itemId: text('item_id').notNull(),
  conceptId: text('concept_id').notNull(),
  answer: text('answer').notNull(),
  confidence: integer('confidence'),
  gradeJson: text('grade_json'),
  rating: integer('rating').notNull(),
  assisted: integer('assisted').notNull().default(0),
  disputed: integer('disputed').notNull().default(0),
  createdAt: ts(),
}, (t) => [index('receipts_course').on(t.courseId, t.createdAt)]);

export const jol = sqliteTable('jol', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  courseId: text('course_id').notNull(),
  conceptId: text('concept_id').notNull(),
  predictedRecall: real('predicted_recall').notNull(),
  actualOutcome: integer('actual_outcome'),
  checkedAt: integer('checked_at'),
  createdAt: ts(),
});

export const fsrsParams = sqliteTable('fsrs_params', {
  courseId: text('course_id').primaryKey(),
  wJson: text('w_json').notNull(),
  desiredRetention: real('desired_retention').notNull(),
  optimizedAt: integer('optimized_at'),
  nReviews: integer('n_reviews').notNull().default(0),
  logloss: real('logloss'),
});

export const llmCalls = sqliteTable('llm_calls', {
  id: text('id').primaryKey(),
  sessionId: text('session_id'),
  courseId: text('course_id'),
  role: text('role').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  cacheRead: integer('cache_read').notNull().default(0),
  cacheWrite: integer('cache_write').notNull().default(0),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  createdAt: ts(),
}, (t) => [index('llm_calls_created').on(t.createdAt)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
});

export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op').notNull(),
  createdAt: ts(),
});
