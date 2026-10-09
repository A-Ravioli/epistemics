/**
 * The Architect pipeline: outline → concepts → graph → scripts → items → item check → freeze.
 *
 * Pure orchestration over an `LlmProvider` and a `GenCache`. Every stage call is
 * cached under sha256(stage + promptVersion + model + canonicalJson(inputs)), so
 * re-running a build regenerates only what is missing. All content ids are
 * deterministic (`stableId`) so republishing keeps learner state keyed correctly.
 */
import { canonicalJson, sha256, stableId } from '@epistemics/core';
import type {
  Chunk, Concept, ConceptEdge, ConceptScript, Curriculum, Item, ItemType, Lesson, Objective, SourceDoc, SourceSpan, Unit,
} from '@epistemics/core';
import type { LlmProvider, LlmRequest } from '@epistemics/llm';
import type { z } from 'zod';
import { cacheKey, type GenCache } from './cache.js';
import { findConfusablePairs, validateGraph, type ConfusablePair } from './graph.js';
import { ARCHITECT_PROMPTS, ARCHITECT_PROMPT_VERSION, type ArchitectStage } from './prompts/index.js';
import {
  ConceptsOutputSchema, GraphOutputSchema, ItemCheckOutputSchema, ItemsOutputSchema, OutlineOutputSchema, ScriptOutputSchema,
  type ItemOutput, type OutlineOutput,
} from './schemas.js';
import { describeOutline, SUBJECT_ONLY_INSTRUCTIONS, WITH_SOURCES_INSTRUCTIONS, type OutlineRequestInputs } from './subjectOnly.js';

export const ARCHITECT_GENERATOR = { name: 'architect', version: '0.1.0' } as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SourceInput {
  source: SourceDoc;
  chunks: Chunk[];
}

export interface ProgressEvent {
  stage: ArchitectStage | 'validate' | 'freeze';
  status: 'start' | 'done' | 'cached';
  unit?: number;
  lesson?: number;
  concept?: string;
  message?: string;
}

export type ArchitectModels = Partial<Record<'architect' | 'itemwriter', string>>;

export interface BuildInput {
  provider: LlmProvider;
  cache: GenCache;
  subject: string;
  level: string;
  goals?: string;
  sources?: SourceInput[];
  /** Optional semantic retriever over the sources, used to widen a lesson's context. */
  retrieve?: (query: string, k: number) => Promise<Chunk[]>;
  /** How many leading units to fully build now (default 2, per DESIGN §8.1 step 7). */
  unitsToBuild?: number | 'all';
  promptVersion?: string;
  models?: ArchitectModels;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  /** Override the outline's title. */
  title?: string;
  /** Clock override for manifest.createdAt (tests). */
  now?: () => number;
}

export type UnitBuildInput = Omit<BuildInput, 'subject' | 'level' | 'unitsToBuild' | 'title'> & {
  /** The outline used for the original build; recomputed (from cache) when omitted. */
  outline?: OutlineOutput;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface Ctx {
  provider: LlmProvider;
  cache: GenCache;
  promptVersion: string;
  models: ArchitectModels;
  chunkIndex: Map<string, Chunk>;
  sources: SourceInput[];
  hasSources: boolean;
  retrieve?: (query: string, k: number) => Promise<Chunk[]>;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
}

interface ConceptDraft extends Omit<Concept, 'script' | 'items'> {
  unitOrdinal: number;
  lessonOrdinal: number;
  lessonId: string;
}

const STAGE_ROLE: Record<ArchitectStage, 'architect' | 'itemwriter'> = {
  outline: 'architect', concepts: 'architect', graph: 'architect', scripts: 'architect', items: 'itemwriter', itemcheck: 'itemwriter',
};

const SELF_GRADED: ReadonlySet<ItemType> = new Set<ItemType>(['recall', 'cloze', 'predict']);
const MAX_CONTEXT_TOKENS = 12_000;

function makeCtx(input: Omit<BuildInput, 'subject' | 'level' | 'unitsToBuild' | 'title'>): Ctx {
  const sources = input.sources ?? [];
  const chunkIndex = new Map<string, Chunk>();
  for (const s of sources) for (const c of s.chunks) chunkIndex.set(c.id, c);
  const ctx: Ctx = {
    provider: input.provider,
    cache: input.cache,
    promptVersion: input.promptVersion ?? ARCHITECT_PROMPT_VERSION,
    models: input.models ?? {},
    chunkIndex,
    sources,
    hasSources: chunkIndex.size > 0,
  };
  if (input.retrieve) ctx.retrieve = input.retrieve;
  if (input.onProgress) ctx.onProgress = input.onProgress;
  if (input.signal) ctx.signal = input.signal;
  return ctx;
}

function throwIfAborted(ctx: Ctx): void {
  if (ctx.signal?.aborted) throw new Error('buildCurriculum: aborted');
}

function emit(ctx: Ctx, e: ProgressEvent): void {
  ctx.onProgress?.(e);
}

// ---------------------------------------------------------------------------
// Stage runner (cache + provider)
// ---------------------------------------------------------------------------

function modelKey(ctx: Ctx, role: 'architect' | 'itemwriter'): string {
  return ctx.models[role] ?? `${ctx.provider.name}/default`;
}

function renderUserMessage(inputs: Record<string, unknown>): string {
  return Object.entries(inputs)
    .map(([k, v]) => (typeof v === 'string' ? `## ${k}\n${v}` : `## ${k}\n\`\`\`json\n${JSON.stringify(v, null, 1)}\n\`\`\``))
    .join('\n\n');
}

async function runStage<T>(
  ctx: Ctx,
  stage: ArchitectStage,
  schema: z.ZodType<T>,
  inputs: Record<string, unknown>,
  where: Pick<ProgressEvent, 'unit' | 'lesson' | 'concept'> = {},
): Promise<T> {
  const role = STAGE_ROLE[stage];
  const key = await cacheKey(stage, ctx.promptVersion, modelKey(ctx, role), inputs);
  const cached = await ctx.cache.get(key);
  if (cached !== null) {
    try {
      const parsed = schema.safeParse(JSON.parse(cached));
      if (parsed.success) {
        emit(ctx, { stage, status: 'cached', ...where });
        return parsed.data;
      }
    } catch {
      /* corrupt cache entry: regenerate */
    }
  }
  throwIfAborted(ctx);
  emit(ctx, { stage, status: 'start', ...where });
  const req: LlmRequest = {
    role,
    system: [{ text: ARCHITECT_PROMPTS[stage], cache: true }],
    messages: [{ role: 'user', content: renderUserMessage(inputs) }],
    effort: role === 'architect' ? 'high' : 'medium',
  };
  const model = ctx.models[role];
  if (model) req.model = model;
  if (ctx.signal) req.signal = ctx.signal;
  const { value } = await ctx.provider.structured(req, schema, `architect_${stage}`);
  await ctx.cache.put(key, JSON.stringify(value));
  emit(ctx, { stage, status: 'done', ...where });
  return value;
}

// ---------------------------------------------------------------------------
// Sources → prompt context
// ---------------------------------------------------------------------------

interface ManifestGroup { heading: string; pages?: string; chunkIds: string[]; preview: string }

function sourceManifest(ctx: Ctx): { id: string; title: string; kind: string; pageCount?: number; sections: ManifestGroup[] }[] {
  return ctx.sources.map(({ source, chunks }) => {
    const sections: ManifestGroup[] = [];
    for (const c of chunks) {
      const heading = c.headingPath.join(' > ');
      const last = sections[sections.length - 1];
      if (last && last.heading === heading) {
        last.chunkIds.push(c.id);
        if (c.pageEnd !== undefined && last.pages) last.pages = `${last.pages.split('-')[0]}-${c.pageEnd}`;
        continue;
      }
      const g: ManifestGroup = { heading, chunkIds: [c.id], preview: c.text.slice(0, 160).replace(/\s+/g, ' ') };
      if (c.pageStart !== undefined) g.pages = `${c.pageStart}-${c.pageEnd ?? c.pageStart}`;
      sections.push(g);
    }
    const out: { id: string; title: string; kind: string; pageCount?: number; sections: ManifestGroup[] } = {
      id: source.id, title: source.title, kind: source.kind, sections,
    };
    if (source.pageCount !== undefined) out.pageCount = source.pageCount;
    return out;
  });
}

function chunkForPrompt(c: Chunk): { id: string; heading: string; page?: number; text: string } {
  const o: { id: string; heading: string; page?: number; text: string } = { id: c.id, heading: c.headingPath.join(' > '), text: c.text };
  if (c.pageStart !== undefined) o.page = c.pageStart;
  return o;
}

async function lessonContext(ctx: Ctx, chunkIds: string[], query: string): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const seen = new Set<string>();
  const push = (c: Chunk) => {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  };
  for (const id of chunkIds) {
    const c = ctx.chunkIndex.get(id);
    if (c) push(c);
  }
  if (ctx.retrieve && ctx.hasSources) {
    for (const c of await ctx.retrieve(query, 6)) if (ctx.chunkIndex.has(c.id)) push(c);
  }
  let budget = MAX_CONTEXT_TOKENS;
  return out.filter((c) => (budget -= c.tokenCount) >= 0 || out.indexOf(c) === 0);
}

/** Keep only spans whose chunk exists and whose quote appears verbatim (whitespace-insensitive) in that chunk. */
export function validateSpans(spans: SourceSpan[], chunkIndex: Map<string, Chunk>): SourceSpan[] {
  if (!chunkIndex.size) return [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: SourceSpan[] = [];
  for (const s of spans) {
    const chunk = chunkIndex.get(s.chunkId);
    if (!chunk) continue;
    const quote = norm(s.quote);
    if (!quote || !norm(chunk.text).includes(quote)) continue;
    const span: SourceSpan = { chunkId: s.chunkId, quote: s.quote.trim() };
    const page = s.page ?? chunk.pageStart;
    if (page !== undefined) span.page = page;
    const heading = s.heading ?? chunk.headingPath[chunk.headingPath.length - 1];
    if (heading) span.heading = heading;
    out.push(span);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export async function curriculumIdFor(subject: string, level: string, goals: string | undefined, sources: SourceInput[]): Promise<string> {
  const sourceHashes = sources.map((s) => s.source.hash).sort();
  return stableId('curriculum', canonicalJson({ subject, level, goals: goals ?? '', sourceHashes }));
}

const unitId = (curriculumId: string, u: number) => stableId('unit', `${curriculumId}:${u}`);
const lessonId = (curriculumId: string, u: number, l: number) => stableId('lesson', `${curriculumId}:${u}:${l}`);
const conceptId = (curriculumId: string, u: number, l: number, name: string) => stableId('concept', `${curriculumId}:${u}:${l}:${name}`);

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export interface OutlineInput {
  provider: LlmProvider;
  cache: GenCache;
  subject: string;
  level: string;
  goals?: string;
  sources?: SourceInput[];
  promptVersion?: string;
  models?: ArchitectModels;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
}

/** Stage 1 on its own (cached): the app shows it on the outline screen before committing to a build. */
export async function generateOutline(input: OutlineInput): Promise<OutlineOutput> {
  const ctx = makeCtx(input);
  return runOutline(ctx, input.subject, input.level, input.goals);
}

async function runOutline(ctx: Ctx, subject: string, level: string, goals: string | undefined): Promise<OutlineOutput> {
  const inputs: OutlineRequestInputs = ctx.hasSources
    ? { subject, level, goals: goals ?? '', mode: 'sources', instructions: WITH_SOURCES_INSTRUCTIONS, sources: sourceManifest(ctx) }
    : { subject, level, goals: goals ?? '', mode: 'subject-only', instructions: SUBJECT_ONLY_INSTRUCTIONS };
  const outline = await runStage(ctx, 'outline', OutlineOutputSchema, { ...inputs });
  if (!ctx.hasSources) outline.units.forEach((u) => u.lessons.forEach((l) => (l.chunkIds = [])));
  return outline;
}

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

async function runConceptsForLesson(
  ctx: Ctx,
  curriculumId: string,
  subject: string,
  level: string,
  outline: OutlineOutput,
  u: number,
  l: number,
  previous: ConceptDraft[],
): Promise<ConceptDraft[]> {
  const unit = outline.units[u]!;
  const lesson = unit.lessons[l]!;
  const context = await lessonContext(ctx, lesson.chunkIds, `${lesson.title}. ${lesson.summary}`);
  const inputs: Record<string, unknown> = {
    subject,
    level,
    unit: { ordinal: u, title: unit.title, summary: unit.summary },
    lesson: { ordinal: l, title: lesson.title, summary: lesson.summary },
    previousConcepts: previous.map((c) => ({ name: c.name, definition: c.definition })),
    sourcesAvailable: ctx.hasSources,
    sourceText: ctx.hasSources ? context.map(chunkForPrompt) : [],
  };
  const out = await runStage(ctx, 'concepts', ConceptsOutputSchema, inputs, { unit: u, lesson: l });
  const lid = await lessonId(curriculumId, u, l);
  const drafts: ConceptDraft[] = [];
  const names = new Set<string>();
  for (let i = 0; i < out.concepts.length; i++) {
    const c = out.concepts[i]!;
    let name = c.name.trim();
    if (names.has(name.toLowerCase())) name = `${name} (${i + 1})`;
    names.add(name.toLowerCase());
    const id = await conceptId(curriculumId, u, l, name);
    const objectives: Objective[] = [];
    for (let j = 0; j < c.objectives.length; j++) {
      objectives.push({ id: await stableId('objective', `${id}:${j}`), bloom: c.objectives[j]!.bloom, text: c.objectives[j]!.text });
    }
    drafts.push({
      id,
      ordinal: previous.length + drafts.length,
      name,
      definition: c.definition,
      objectives,
      misconceptions: c.misconceptions.map((m) => ({ tag: slug(m.tag), description: m.description, remedy: m.remedy })),
      examples: c.examples.map((e) => (e.domain ? { title: e.title, body: e.body, domain: e.domain } : { title: e.title, body: e.body })),
      spans: validateSpans(c.spans, ctx.chunkIndex),
      unitOrdinal: u,
      lessonOrdinal: l,
      lessonId: lid,
    });
  }
  return drafts;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misconception';
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

async function runGraph(ctx: Ctx, known: ConceptDraft[], fresh: ConceptDraft[], existing: ConceptEdge[]): Promise<ConceptEdge[]> {
  const describe = (c: ConceptDraft) => ({
    id: c.id, name: c.name, definition: c.definition, unit: c.unitOrdinal, lesson: c.lessonOrdinal, quotes: c.spans.map((s) => s.quote),
  });
  let proposed: ConceptEdge[] = [];
  if (fresh.length) {
    const out = await runStage(ctx, 'graph', GraphOutputSchema, { known: known.map(describe), new: fresh.map(describe) });
    proposed = out.edges.map((e) => {
      const edge: ConceptEdge = { from: e.from, to: e.to, kind: e.kind, justification: e.justification, confidence: e.confidence };
      if (e.kind === 'encompasses') edge.weight = e.weight ?? 0.5;
      return edge;
    });
  }
  emit(ctx, { stage: 'validate', status: 'start' });
  const all = [...known, ...fresh].sort((a, b) => a.unitOrdinal - b.unitOrdinal || a.lessonOrdinal - b.lessonOrdinal || a.ordinal - b.ordinal);
  const { edges, dropped } = validateGraph(all.map((c) => c.id), [...existing, ...proposed]);
  emit(ctx, { stage: 'validate', status: 'done', message: dropped.length ? `dropped ${dropped.length} edge(s)` : undefined });
  return edges;
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

function conceptForPrompt(c: ConceptDraft) {
  return {
    name: c.name,
    definition: c.definition,
    objectives: c.objectives.map((o) => ({ bloom: o.bloom, text: o.text })),
    misconceptions: c.misconceptions,
    examples: c.examples,
    quotes: c.spans.map((s) => ({ quote: s.quote, page: s.page, heading: s.heading })),
  };
}

async function runScript(ctx: Ctx, c: ConceptDraft, byId: Map<string, ConceptDraft>, edges: ConceptEdge[]): Promise<ConceptScript> {
  const prereqs = edges.filter((e) => e.kind === 'prereq' && e.to === c.id).map((e) => byId.get(e.from)?.name).filter(Boolean);
  const dependents = edges.filter((e) => e.kind === 'prereq' && e.from === c.id).map((e) => byId.get(e.to)?.name).filter(Boolean);
  const out = await runStage(ctx, 'scripts', ScriptOutputSchema, {
    concept: conceptForPrompt(c),
    neighbours: { prerequisites: prereqs, dependents },
    sourcesAvailable: ctx.hasSources,
  }, { unit: c.unitOrdinal, lesson: c.lessonOrdinal, concept: c.name });
  return {
    pretest: out.pretest,
    guidingQuestions: out.guidingQuestions.map((q) =>
      q.probesMisconception ? { question: q.question, expected: q.expected, probesMisconception: slug(q.probesMisconception) } : { question: q.question, expected: q.expected },
    ),
    workedExample: out.workedExample,
    transfer: out.transfer,
    hints: out.hints,
  };
}

// ---------------------------------------------------------------------------
// Items + self-check
// ---------------------------------------------------------------------------

interface ItemContext {
  confusableWith: { name: string; definition: string }[];
  dependents: { name: string; definition: string }[];
  chunks: Chunk[];
}

async function toItems(ctx: Ctx, c: ConceptDraft, outputs: ItemOutput[]): Promise<Item[]> {
  const items: Item[] = [];
  const ids = new Set<string>();
  for (const o of outputs) {
    const id = await stableId('item', `${c.id}:${await sha256(o.prompt)}`);
    if (ids.has(id)) continue;
    ids.add(id);
    const rubric = SELF_GRADED.has(o.type)
      ? []
      : o.rubric.map((r, i) => (r.evidenceHint ? { id: `c${i + 1}`, text: r.text, evidenceHint: r.evidenceHint } : { id: `c${i + 1}`, text: r.text }));
    const reference: Item['reference'] = { answer: o.reference.answer };
    if (o.reference.exact) reference.exact = o.reference.exact;
    if (o.reference.notes) reference.notes = o.reference.notes;
    const item: Item = {
      id,
      conceptId: c.id,
      type: o.type,
      bloom: o.bloom,
      prompt: o.prompt,
      reference,
      rubric,
      spans: validateSpans(o.spans, ctx.chunkIndex),
      generatorVersion: `${ARCHITECT_GENERATOR.name}@${ctx.promptVersion}`,
      hash: await sha256(canonicalJson({ prompt: o.prompt, reference, rubric })),
    };
    if (o.tags?.length) item.tags = o.tags;
    items.push(item);
  }
  return items;
}

/** Code-level checks that do not need a model call. */
function structuralIssues(item: Item): string[] {
  const issues: string[] = [];
  if (!SELF_GRADED.has(item.type) && (item.rubric.length < 3 || item.rubric.length > 6)) issues.push('rubric must have 3-6 criteria');
  if (item.type === 'cloze' && !item.prompt.includes('___')) issues.push('cloze prompt has no ___ gap');
  return issues;
}

async function checkItems(ctx: Ctx, c: ConceptDraft, items: Item[]): Promise<Map<string, string[]>> {
  const flagged = new Map<string, string[]>();
  for (const it of items) {
    const issues = structuralIssues(it);
    if (issues.length) flagged.set(it.id, issues);
  }
  if (!items.length) return flagged;
  const out = await runStage(ctx, 'itemcheck', ItemCheckOutputSchema, {
    concept: { name: c.name, definition: c.definition },
    items: items.map((it, index) => ({ index, type: it.type, bloom: it.bloom, prompt: it.prompt, rubric: it.rubric.map((r) => r.text) })),
  }, { unit: c.unitOrdinal, lesson: c.lessonOrdinal, concept: c.name });
  for (const r of out.results) {
    const it = items[r.index];
    if (!it) continue;
    if (!r.answerable || r.ambiguous) {
      const issues = [...(flagged.get(it.id) ?? []), ...r.issues];
      flagged.set(it.id, issues.length ? issues : ['flagged by self-check']);
    }
  }
  return flagged;
}

async function runItems(ctx: Ctx, c: ConceptDraft, ictx: ItemContext): Promise<Item[]> {
  const where = { unit: c.unitOrdinal, lesson: c.lessonOrdinal, concept: c.name };
  const base: Record<string, unknown> = {
    concept: conceptForPrompt(c),
    confusableWith: ictx.confusableWith,
    dependents: ictx.dependents,
    sourcesAvailable: ctx.hasSources,
    sourceText: ctx.hasSources ? ictx.chunks.map(chunkForPrompt) : [],
  };
  const first = await runStage(ctx, 'items', ItemsOutputSchema, base, where);
  let items = await toItems(ctx, c, first.items);
  const flagged = await checkItems(ctx, c, items);
  if (!flagged.size) return items;

  // Regenerate the flagged items once, then re-check the replacements; anything still flagged is dropped.
  const bad = items.filter((it) => flagged.has(it.id));
  items = items.filter((it) => !flagged.has(it.id));
  const again = await runStage(ctx, 'items', ItemsOutputSchema, {
    ...base,
    regenerate: {
      count: bad.length,
      instructions: `Write exactly ${bad.length} replacement item(s) for the rejected ones below, fixing the listed issues and avoiding the existing prompts.`,
      rejected: bad.map((it) => ({ type: it.type, prompt: it.prompt, issues: flagged.get(it.id) })),
      existingPrompts: items.map((it) => it.prompt),
    },
  }, where);
  const known = new Set(items.map((it) => it.id));
  const replacements = (await toItems(ctx, c, again.items)).filter((it) => !known.has(it.id));
  const reflagged = await checkItems(ctx, c, replacements);
  return [...items, ...replacements.filter((it) => !reflagged.has(it.id))];
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

async function skeleton(curriculumId: string, outline: OutlineOutput): Promise<Unit[]> {
  const units: Unit[] = [];
  for (let u = 0; u < outline.units.length; u++) {
    const ou = outline.units[u]!;
    const lessons: Lesson[] = [];
    for (let l = 0; l < ou.lessons.length; l++) {
      const ol = ou.lessons[l]!;
      const lesson: Lesson = { id: await lessonId(curriculumId, u, l), ordinal: l, title: ol.title, concepts: [] };
      if (ol.summary) lesson.summary = ol.summary;
      lessons.push(lesson);
    }
    units.push({ id: await unitId(curriculumId, u), ordinal: u, title: ou.title, summary: ou.summary, lessons });
  }
  return units;
}

/** A unit is built when every lesson has at least one concept. */
export function isUnitBuilt(unit: Unit): boolean {
  return unit.lessons.length > 0 && unit.lessons.every((l) => l.concepts.length > 0);
}

function draftsFromCurriculum(units: Unit[]): ConceptDraft[] {
  const out: ConceptDraft[] = [];
  for (const u of units) {
    for (const l of u.lessons) {
      for (const c of l.concepts) {
        const { script: _s, items: _i, ...rest } = c;
        out.push({ ...rest, unitOrdinal: u.ordinal, lessonOrdinal: l.ordinal, lessonId: l.id });
      }
    }
  }
  return out;
}

async function contentHash(units: Unit[], edges: ConceptEdge[]): Promise<string> {
  return sha256(canonicalJson({ units, edges }));
}

/**
 * Build one or more units in place: concepts for every lesson, then graph edges
 * (incremental against the concepts already in the curriculum), scripts, items
 * and the item self-check. Returns a new Curriculum object.
 */
async function buildUnits(
  ctx: Ctx,
  curriculum: Curriculum,
  outline: OutlineOutput,
  unitOrdinals: number[],
): Promise<Curriculum> {
  const { subject, level } = curriculum.manifest;
  const curriculumId = curriculum.manifest.id;
  const units = curriculum.units.map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, concepts: [...l.concepts] })) }));
  const known = draftsFromCurriculum(units);
  const fresh: ConceptDraft[] = [];

  for (const u of unitOrdinals) {
    const unit = units[u];
    const ou = outline.units[u];
    if (!unit || !ou) throw new Error(`buildUnit: unit ${u} is not in the outline`);
    if (isUnitBuilt(unit)) continue;
    for (let l = 0; l < ou.lessons.length; l++) {
      throwIfAborted(ctx);
      const lesson = unit.lessons[l]!;
      if (lesson.concepts.length) continue;
      const drafts = await runConceptsForLesson(ctx, curriculumId, subject, level, outline, u, l, [...known, ...fresh]);
      fresh.push(...drafts);
    }
  }

  const edges = await runGraph(ctx, known, fresh, curriculum.edges);
  const all = [...known, ...fresh];
  const byId = new Map(all.map((c) => [c.id, c]));
  const pairs: ConfusablePair[] = await findConfusablePairs(
    all.map((c) => ({ id: c.id, name: c.name, definition: c.definition, lessonId: c.lessonId })),
    edges,
  );

  for (const c of fresh) {
    throwIfAborted(ctx);
    const script = await runScript(ctx, c, byId, edges);
    const confusableWith = pairs
      .filter((p) => p.a === c.id || p.b === c.id)
      .map((p) => byId.get(p.a === c.id ? p.b : p.a))
      .filter((x): x is ConceptDraft => !!x)
      .slice(0, 3)
      .map((x) => ({ name: x.name, definition: x.definition }));
    const dependents = edges
      .filter((e) => e.kind === 'prereq' && e.from === c.id)
      .map((e) => byId.get(e.to))
      .filter((x): x is ConceptDraft => !!x)
      .map((x) => ({ name: x.name, definition: x.definition }));
    const chunks = c.spans.map((s) => ctx.chunkIndex.get(s.chunkId)).filter((x): x is Chunk => !!x);
    const items = await runItems(ctx, c, { confusableWith, dependents, chunks });
    const { unitOrdinal, lessonOrdinal, lessonId: lid, ...rest } = c;
    const concept: Concept = { ...rest, script, items };
    const lesson = units[unitOrdinal]!.lessons[lessonOrdinal]!;
    if (lesson.id !== lid) throw new Error('buildUnit: lesson id mismatch');
    lesson.concepts.push(concept);
  }

  emit(ctx, { stage: 'freeze', status: 'start' });
  const hash = await contentHash(units, edges);
  emit(ctx, { stage: 'freeze', status: 'done' });
  return { ...curriculum, manifest: { ...curriculum.manifest, contentHash: hash }, units, edges };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function buildCurriculum(input: BuildInput): Promise<Curriculum> {
  const ctx = makeCtx(input);
  const outline = await runOutline(ctx, input.subject, input.level, input.goals);
  const id = await curriculumIdFor(input.subject, input.level, input.goals, ctx.sources);
  const units = await skeleton(id, outline);
  const manifest: Curriculum['manifest'] = {
    id,
    version: 1,
    title: input.title ?? outline.title,
    subject: input.subject,
    description: describeOutline(outline),
    level: input.level,
    contentHash: '',
    generator: { ...ARCHITECT_GENERATOR, promptVersion: ctx.promptVersion },
    createdAt: (input.now ?? Date.now)(),
  };
  const model = ctx.models.architect;
  if (model) manifest.generator.model = model;
  const empty: Curriculum = { manifest, units, edges: [], sources: ctx.sources.map((s) => s.source) };
  const want = input.unitsToBuild === 'all' ? units.length : Math.min(units.length, Math.max(0, input.unitsToBuild ?? 2));
  const ordinals = Array.from({ length: want }, (_, i) => i);
  return buildUnits(ctx, empty, outline, ordinals);
}

/**
 * Lazily build one not-yet-built unit of an existing curriculum (the app keeps
 * two units ahead of the learner). Uses the cached outline when `outline` is
 * omitted; the same sources must be supplied as for the original build.
 */
export async function buildUnit(curriculum: Curriculum, unitOrdinal: number, input: UnitBuildInput): Promise<Curriculum> {
  const ctx = makeCtx(input);
  const outline = input.outline ?? (await runOutline(ctx, curriculum.manifest.subject, curriculum.manifest.level, input.goals));
  if (outline.units.length !== curriculum.units.length) {
    throw new Error('buildUnit: outline does not match the curriculum (different unit count); pass the original outline');
  }
  return buildUnits(ctx, curriculum, outline, [unitOrdinal]);
}
