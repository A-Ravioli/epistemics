/**
 * CurriculumBuilder: the app-side driver of the Architect pipeline (DESIGN §3.1 step 3, §8.1).
 *
 *   ingestFiles      picked files → @epistemics/ingest → sources + chunks (+ hash embeddings) in the db
 *   proposeOutline   stage 1 only (cached) so the outline screen can show it for editing
 *   build            the edited outline is seeded into the gen cache under the outline stage's own key,
 *                    then buildCurriculum(unitsToBuild: 2) runs and the curriculum is saved
 *   buildNextUnit    lazy path: buildUnit for the first unbuilt unit of a course's curriculum
 *   ensureUnitsAhead keep units generated two ahead of the learner (Today calls this fire-and-forget)
 *
 * How the outline edit reaches the pipeline: `buildCurriculum` always recomputes the outline through
 * `runStage('outline', ...)`, which consults the GenCache first. The cache key is
 * sha256(stage + promptVersion + model + canonicalJson(inputs)) and the inputs include the rendered source
 * manifest, which the pipeline does not export. Rather than re-deriving it, the db-backed cache records
 * every key it is asked for; `generateOutline` touches exactly one key (the outline stage's), so
 * `proposeOutline` captures it and `build` writes the edited outline under that key. The pipeline then
 * "hits" the edited outline, and every later stage keys off it. The outline is also stored under an
 * app-level key per curriculum and passed explicitly to `buildUnit` on the lazy path, so a later change
 * of provider/model cannot regenerate a different outline for an existing curriculum.
 *
 * Ids: never computed here; the pipeline's `stableId` scheme is the only source of ids, and nothing that
 * is cached is regenerated (the cache is content-addressed, so re-running a build costs nothing).
 */
import { CurriculumSchema, uuidv7, type Chunk, type Course, type Curriculum, type SourceDoc, type Unit } from '@epistemics/core';
import {
  buildCurriculum, buildUnit, curriculumIdFor, generateOutline, isUnitBuilt, OutlineOutputSchema,
  type ArchitectModels, type GenCache, type OutlineOutput, type ProgressEvent, type SourceInput,
} from '@epistemics/architect';
import type { Db } from '@epistemics/db';
import {
  getCached, getCards, getChunksBySource, getCourse, getCurriculum, getEmbeddings, getSource, listCourses, putCached, saveCurriculum,
  saveEmbedding, saveSource, schema, setSourceCurriculum, UNACTIVATED_OFFSET_MS,
} from '@epistemics/db';
import { configurePdfWorker, cosineTopK, createHashEmbedder, ingest, type Embedder } from '@epistemics/ingest';
import type { LlmProvider } from '@epistemics/llm';
import type { PickedFile } from '@epistemics/platform';
import { addBuiltCurriculum } from '../settings.js';
import { createStore, type Store } from '../store.js';

export const UNITS_AHEAD = 2;
export const INITIAL_UNITS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildSpec {
  subject: string;
  level: string;
  goals?: string;
  /** Ids of ingested sources (empty for a subject-only build). */
  sourceIds: string[];
}

export interface IngestedSource {
  source: SourceDoc;
  chunkCount: number;
  tokenCount: number;
  /** Heading paths seen in the document, for the summary line. */
  sectionCount: number;
}

export interface OutlineProposal {
  curriculumId: string;
  outline: OutlineOutput;
  /** The outline stage's gen-cache key, captured while proposing (see module doc). */
  outlineCacheKey: string;
  spec: BuildSpec;
}

/** What the app stored about a build, keyed by curriculum id (gen_cache kind 'app-build'). */
export interface BuildRecord {
  spec: BuildSpec;
  outline: OutlineOutput;
  outlineCacheKey: string;
}

export type BuildPhase = 'idle' | 'ingesting' | 'outlining' | 'building' | 'done' | 'error';

export interface BuildLogEntry {
  at: number;
  event: ProgressEvent;
}

export interface BuildProgress {
  phase: BuildPhase;
  message?: string;
  /** Latest pipeline event. */
  event?: ProgressEvent;
  /** Counts of stage events by status (freeze/validate included). */
  started: number;
  done: number;
  cached: number;
  log: BuildLogEntry[];
  error?: string;
}

export interface UnitBuildStatus {
  curriculumId: string;
  version: number;
  unit: number;
  unitTitle: string;
  event?: ProgressEvent;
}

const initialProgress = (): BuildProgress => ({ phase: 'idle', started: 0, done: 0, cached: 0, log: [] });

/** Background unit builds in flight, keyed by `${curriculumId}@${version}`; the Today screen shows a pill from this. */
export const unitBuilds: Store<Record<string, UnitBuildStatus>> = createStore({});

const inflight = new Map<string, Promise<Curriculum>>();

export const curriculumKey = (id: string, version: number) => `${id}@${version}`;
export const buildRecordKey = (curriculumId: string) => `app:build:${curriculumId}`;

// ---------------------------------------------------------------------------
// Gen cache over the gen_cache table
// ---------------------------------------------------------------------------

/** GenCache backed by the `gen_cache` repository; records the keys it is asked for. */
export class DbGenCache implements GenCache {
  readonly keys: string[] = [];
  constructor(private readonly db: Db, private readonly kind = 'architect') {}
  async get(key: string): Promise<string | null> {
    this.keys.push(key);
    const v = await getCached<unknown>(this.db, key);
    return v === undefined ? null : JSON.stringify(v);
  }
  async put(key: string, json: string): Promise<void> {
    await putCached(this.db, key, this.kind, JSON.parse(json) as unknown);
  }
}

// ---------------------------------------------------------------------------
// pdf.js worker
// ---------------------------------------------------------------------------

let pdfWorkerConfigured = false;
function ensurePdfWorker(): void {
  if (pdfWorkerConfigured || typeof window === 'undefined') return;
  pdfWorkerConfigured = true;
  configurePdfWorker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href);
}

// ---------------------------------------------------------------------------
// Sources and retrieval
// ---------------------------------------------------------------------------

export async function loadSources(db: Db, sourceIds: readonly string[]): Promise<SourceInput[]> {
  const out: SourceInput[] = [];
  for (const id of sourceIds) {
    const source = await getSource(db, id);
    if (!source) continue;
    out.push({ source, chunks: await getChunksBySource(db, id) });
  }
  return out;
}

/** Cosine retrieval over the embeddings stored for these sources; undefined when there is nothing to search. */
export async function makeRetriever(db: Db, embedder: Embedder, sources: SourceInput[]): Promise<((query: string, k: number) => Promise<Chunk[]>) | undefined> {
  if (!sources.length) return undefined;
  const byId = new Map<string, Chunk>();
  for (const s of sources) for (const c of s.chunks) byId.set(c.id, c);
  const stored = await getEmbeddings(db, sources.map((s) => s.source.id));
  const rows = stored.filter((e) => byId.has(e.chunkId));
  if (!rows.length) return undefined;
  const vectors = rows.map((r) => r.embedding);
  return async (query, k) => {
    const [q] = await embedder.embed([query]);
    if (!q) return [];
    return cosineTopK(q, vectors, k).map((r) => byId.get(rows[r.index]!.chunkId)).filter((c): c is Chunk => !!c);
  };
}

// ---------------------------------------------------------------------------
// Cards for a newly built unit
// ---------------------------------------------------------------------------

/** One New (unactivated) card per item of `unit` that the course does not have a card for yet. */
export async function addCardsForUnit(db: Db, course: Course, unit: Unit, now: number = Date.now()): Promise<number> {
  const existing = new Set((await getCards(db, course.id)).map((c) => c.itemId));
  const rows: (typeof schema.cards.$inferInsert)[] = [];
  for (const lesson of unit.lessons) {
    for (const concept of lesson.concepts) {
      for (const item of concept.items) {
        if (existing.has(item.id)) continue;
        existing.add(item.id);
        rows.push({
          id: uuidv7(now), courseId: course.id, itemId: item.id, conceptId: concept.id,
          state: 0, due: now + UNACTIVATED_OFFSET_MS, lastReview: null,
          stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0,
          suspended: 0, provisional: 0, updatedAt: now,
        });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 100) await db.insert(schema.cards).values(rows.slice(i, i + 100)).run();
  return rows.length;
}

/** Units in teaching order with their built state. */
export function unitStatus(curriculum: Curriculum): { unit: Unit; built: boolean }[] {
  return [...curriculum.units].sort((a, b) => a.ordinal - b.ordinal).map((unit) => ({ unit, built: isUnitBuilt(unit) }));
}

export function builtUnitCount(curriculum: Curriculum): number {
  return curriculum.units.filter(isUnitBuilt).length;
}

export function isFullyBuilt(curriculum: Curriculum): boolean {
  return curriculum.units.length > 0 && curriculum.units.every(isUnitBuilt) && CurriculumSchema.safeParse(curriculum).success;
}

/** The unbuilt units (sorted positions) within `ahead` of the unit at `currentUnitOrdinal`, plus that unit itself. */
export function unitsToPrepare(curriculum: Curriculum, currentUnitOrdinal: number, ahead: number = UNITS_AHEAD): Unit[] {
  const status = unitStatus(curriculum);
  let idx = status.findIndex((s) => s.unit.ordinal === currentUnitOrdinal);
  if (idx < 0) idx = 0;
  return status.slice(idx, idx + ahead + 1).filter((s) => !s.built).map((s) => s.unit);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuilderOptions {
  models?: ArchitectModels;
  embedder?: Embedder;
  now?: () => number;
  promptVersion?: string;
}

export class CurriculumBuilder {
  readonly store: Store<BuildProgress> = createStore(initialProgress());
  readonly cache: DbGenCache;
  private readonly embedder: Embedder;
  private readonly now: () => number;
  private controller: AbortController | undefined;

  constructor(readonly db: Db, readonly provider: LlmProvider, private readonly opts: BuilderOptions = {}) {
    this.cache = new DbGenCache(db);
    this.embedder = opts.embedder ?? createHashEmbedder();
    this.now = opts.now ?? Date.now;
  }

  /** Abort the build in progress (the pipeline checks the signal between stages). */
  abort(): void {
    this.controller?.abort();
  }

  reset(): void {
    this.store.set(initialProgress());
  }

  private patch(p: Partial<BuildProgress>): void {
    this.store.set((prev) => ({ ...prev, ...p }));
  }

  private onProgress = (event: ProgressEvent): void => {
    this.store.set((prev) => ({
      ...prev,
      event,
      started: prev.started + (event.status === 'start' ? 1 : 0),
      done: prev.done + (event.status === 'done' ? 1 : 0),
      cached: prev.cached + (event.status === 'cached' ? 1 : 0),
      log: [...prev.log.slice(-199), { at: this.now(), event }],
    }));
  };

  private pipelineOptions() {
    const o: { models?: ArchitectModels; promptVersion?: string; now: () => number } = { now: this.now };
    if (this.opts.models) o.models = this.opts.models;
    if (this.opts.promptVersion) o.promptVersion = this.opts.promptVersion;
    return o;
  }

  // --- ingest ---

  /** Parse, chunk, embed and store picked files. Files that fail to parse are reported in `errors`. */
  async ingestFiles(files: readonly PickedFile[]): Promise<{ sources: IngestedSource[]; errors: string[] }> {
    const sources: IngestedSource[] = [];
    const errors: string[] = [];
    this.patch({ phase: 'ingesting', error: undefined });
    for (const file of files) {
      this.patch({ message: `Parsing ${file.name}` });
      try {
        if (/\.pdf$/i.test(file.name) || file.mime === 'application/pdf') ensurePdfWorker();
        const f: { name: string; bytes: Uint8Array; mime?: string } = { name: file.name, bytes: file.bytes };
        if (file.mime) f.mime = file.mime;
        const r = await ingest(f);
        await saveSource(this.db, r.source, r.chunks, this.now(), null);
        this.patch({ message: `Indexing ${file.name}` });
        const vectors = await this.embedder.embed(r.chunks.map((c) => c.text));
        for (let i = 0; i < r.chunks.length; i++) await saveEmbedding(this.db, r.chunks[i]!.id, vectors[i]!);
        sources.push({
          source: r.source,
          chunkCount: r.chunks.length,
          tokenCount: r.chunks.reduce((a, c) => a + c.tokenCount, 0),
          sectionCount: r.doc.sections.length,
        });
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.patch({ phase: 'idle', message: undefined });
    return { sources, errors };
  }

  // --- outline ---

  async proposeOutline(spec: BuildSpec): Promise<OutlineProposal> {
    this.controller = new AbortController();
    this.patch({ phase: 'outlining', message: 'Proposing an outline', error: undefined });
    try {
      const sources = await loadSources(this.db, spec.sourceIds);
      const before = this.cache.keys.length;
      const input: Parameters<typeof generateOutline>[0] = {
        provider: this.provider, cache: this.cache, subject: spec.subject, level: spec.level, sources,
        onProgress: this.onProgress, signal: this.controller.signal, ...this.pipelineOptions(),
      };
      if (spec.goals) input.goals = spec.goals;
      const outline = await generateOutline(input);
      const touched = this.cache.keys.slice(before);
      const outlineCacheKey = touched[0];
      if (!outlineCacheKey || touched.some((k) => k !== outlineCacheKey)) {
        throw new Error('proposeOutline: could not capture the outline cache key (the pipeline touched an unexpected set of keys)');
      }
      const curriculumId = await curriculumIdFor(spec.subject, spec.level, spec.goals, sources);
      this.patch({ phase: 'idle', message: undefined });
      return { curriculumId, outline, outlineCacheKey, spec };
    } catch (e) {
      this.patch({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  // --- full build ---

  /**
   * Build the first `INITIAL_UNITS` units from the (possibly edited) outline and save the curriculum.
   * The edited outline is written under the outline stage's cache key so the pipeline uses it verbatim.
   */
  async build(proposal: OutlineProposal, edited: OutlineOutput = proposal.outline): Promise<Curriculum> {
    this.controller = new AbortController();
    // Fresh counters: the proposal's outline events must not be mistaken for build progress.
    this.store.set({ ...initialProgress(), phase: 'building', message: 'Building the first units' });
    try {
      const outline = OutlineOutputSchema.parse(edited);
      const { spec } = proposal;
      await this.cache.put(proposal.outlineCacheKey, JSON.stringify(outline));
      const record: BuildRecord = { spec, outline, outlineCacheKey: proposal.outlineCacheKey };
      await putCached(this.db, buildRecordKey(proposal.curriculumId), 'app-build', record, this.now());

      const sources = await loadSources(this.db, spec.sourceIds);
      const retrieve = await makeRetriever(this.db, this.embedder, sources);
      const input: Parameters<typeof buildCurriculum>[0] = {
        provider: this.provider, cache: this.cache, subject: spec.subject, level: spec.level, sources,
        unitsToBuild: INITIAL_UNITS, onProgress: this.onProgress, signal: this.controller.signal, ...this.pipelineOptions(),
      };
      if (spec.goals) input.goals = spec.goals;
      if (retrieve) input.retrieve = retrieve;
      const curriculum = await buildCurriculum(input);
      if (curriculum.manifest.id !== proposal.curriculumId) throw new Error('build: curriculum id changed between outline and build');

      const now = this.now();
      await saveCurriculum(this.db, curriculum, now);
      for (const s of sources) await setSourceCurriculum(this.db, s.source.id, curriculum.manifest.id);
      await addBuiltCurriculum(this.db, curriculum.manifest.id, curriculum.manifest.version, now);
      this.patch({ phase: 'done', message: undefined });
      return curriculum;
    } catch (e) {
      this.patch({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  // --- lazy units ---

  /** Build one unbuilt unit of a saved curriculum, save it, and create its cards for every course on it. */
  buildUnitOf(curriculumId: string, version: number, unitOrdinal: number): Promise<Curriculum> {
    const key = curriculumKey(curriculumId, version);
    const prev = inflight.get(key) ?? Promise.resolve(undefined);
    const run = prev.then(
      () => this.runUnitBuild(curriculumId, version, unitOrdinal),
      () => this.runUnitBuild(curriculumId, version, unitOrdinal),
    );
    inflight.set(key, run);
    void run.catch(() => undefined).finally(() => {
      if (inflight.get(key) === run) inflight.delete(key);
    });
    return run;
  }

  private async runUnitBuild(curriculumId: string, version: number, unitOrdinal: number): Promise<Curriculum> {
    const key = curriculumKey(curriculumId, version);
    const curriculum = await getCurriculum(this.db, curriculumId, version);
    if (!curriculum) throw new Error(`buildUnit: curriculum ${key} not found`);
    const unit = curriculum.units.find((u) => u.ordinal === unitOrdinal);
    if (!unit) throw new Error(`buildUnit: unit ${unitOrdinal} is not in ${key}`);
    if (isUnitBuilt(unit)) return curriculum;

    const status: UnitBuildStatus = { curriculumId, version, unit: unitOrdinal, unitTitle: unit.title };
    unitBuilds.set((prev) => ({ ...prev, [key]: status }));
    const onProgress = (event: ProgressEvent) => {
      this.onProgress(event);
      unitBuilds.set((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], event } } : prev));
    };
    try {
      const record = await getCached<BuildRecord>(this.db, buildRecordKey(curriculumId));
      const sources = await loadSources(this.db, record?.spec.sourceIds ?? curriculum.sources.map((s) => s.id));
      const retrieve = await makeRetriever(this.db, this.embedder, sources);
      const index = curriculum.units.indexOf(unit);
      const input: Parameters<typeof buildUnit>[2] = { provider: this.provider, cache: this.cache, sources, onProgress, ...this.pipelineOptions() };
      if (record?.outline) input.outline = record.outline;
      if (record?.spec.goals) input.goals = record.spec.goals;
      if (retrieve) input.retrieve = retrieve;
      const next = await buildUnit(curriculum, index, input);
      const now = this.now();
      await saveCurriculum(this.db, next, now);
      const built = next.units.find((u) => u.ordinal === unitOrdinal)!;
      for (const course of await listCourses(this.db)) {
        if (course.curriculumId === curriculumId && course.curriculumVersion === version) await addCardsForUnit(this.db, course, built, now);
      }
      return next;
    } finally {
      unitBuilds.set((prev) => {
        const { [key]: _gone, ...rest } = prev;
        return rest;
      });
    }
  }

  /** Lazy path: build the first unbuilt unit of the course's curriculum. Returns undefined when everything is built. */
  async buildNextUnit(courseId: string): Promise<Curriculum | undefined> {
    const course = await getCourse(this.db, courseId);
    if (!course) throw new Error('buildNextUnit: course not found');
    const curriculum = await getCurriculum(this.db, course.curriculumId, course.curriculumVersion);
    if (!curriculum) throw new Error('buildNextUnit: curriculum not found');
    const next = unitStatus(curriculum).find((s) => !s.built);
    if (!next) return undefined;
    return this.buildUnitOf(course.curriculumId, course.curriculumVersion, next.unit.ordinal);
  }

  /**
   * Keep units generated `ahead` units past the learner's current one (DESIGN §8.1 step 7). Builds
   * sequentially and returns the latest curriculum, or undefined when nothing needed building.
   */
  async ensureUnitsAhead(course: Course, currentUnitOrdinal: number, ahead: number = UNITS_AHEAD): Promise<Curriculum | undefined> {
    let curriculum = await getCurriculum(this.db, course.curriculumId, course.curriculumVersion);
    if (!curriculum) return undefined;
    let result: Curriculum | undefined;
    for (const unit of unitsToPrepare(curriculum, currentUnitOrdinal, ahead)) {
      curriculum = await this.buildUnitOf(course.curriculumId, course.curriculumVersion, unit.ordinal);
      result = curriculum;
    }
    return result;
  }
}

/** True when a background build is running for this curriculum version. */
export function isUnitBuildInFlight(curriculumId: string, version: number): boolean {
  return inflight.has(curriculumKey(curriculumId, version));
}
