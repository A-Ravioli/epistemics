/**
 * Tutor call assembly (DESIGN §7.2).
 *
 *   system[0] (cached 1h)  : frozen tutor charter
 *   system[1] (cached 1h)  : curriculum context for this lesson — NO reference answers
 *   messages[0] user (cached): learner model summary + lesson state
 *   messages[1..]          : dialogue; the state machine's control message is appended last as role:'system'
 */
import type { Concept, Lesson, LessonPhase, SourceSpan } from '@epistemics/core';
import type { ChatMessage, Effort, LlmRequest } from '../provider.js';
import { PROMPTS } from '../prompts.js';

export interface TutorControl {
  phase: LessonPhase;
  conceptId: string;
  /** 0..3; the state machine raises it only after an observed attempt. */
  hintLevel: number;
  maxWords: number;
  /** Free-text instruction from the state machine ("ask guiding question 2", "run CONSOLIDATE", ...). */
  instruction: string;
  /** May the tutor use the curriculum context's hint text at the current level? Default true when hintLevel > 0. */
  allowHintContent?: boolean;
  /** Objective in play, e.g. "O2". */
  objectiveId?: string;
  /** Two attempts (or give-up) recorded: the tutor may now reveal the reference the state machine supplies in `instruction`. */
  revealAllowed?: boolean;
}

export interface TutorInput {
  /** Defaults to PROMPTS.tutorCharter. */
  charter?: string;
  curriculumContext: string;
  learnerModelText: string;
  /** Prior dialogue: learner = 'user', tutor = 'assistant'. Earlier control messages may be kept or dropped by the caller. */
  transcript: ChatMessage[];
  control: TutorControl;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  metadata?: LlmRequest['metadata'];
  signal?: AbortSignal;
}

/** Render the state machine's control message. Key=value line first so it is greppable in logs. */
export function renderControl(c: TutorControl): string {
  const kv = [
    `phase=${c.phase}`,
    `concept=${c.conceptId}`,
    `hint_level=${c.hintLevel}`,
    `max_words=${c.maxWords}`,
    ...(c.objectiveId ? [`objective=${c.objectiveId}`] : []),
    `reveal=${c.revealAllowed ? 'allowed' : 'forbidden'}`,
  ].join(' ');
  const allowHint = c.allowHintContent ?? c.hintLevel > 0;
  const hintLine = c.hintLevel <= 0
    ? 'No hint yet: ask a question the learner can answer from what they already know.'
    : allowHint
      ? `You may use hint level ${c.hintLevel} (and lower) from the curriculum context. Do not go beyond it.`
      : `Hint level ${c.hintLevel} is the ceiling, but do not quote the curriculum context's hint text; rephrase at that level.`;
  const revealLine = c.revealAllowed ? '' : '\nDo not state the answer to the pretest, transfer or check question.';
  const lengthLine = `\nAt most one question. At most ${c.maxWords} words.`;
  return `${kv}\n${c.instruction.trim()}\n${hintLine}${revealLine}${lengthLine}`;
}

export function buildTutorRequest(input: TutorInput): LlmRequest {
  const messages: ChatMessage[] = [
    { role: 'user', content: input.learnerModelText, cache: true },
    ...input.transcript.map((m) => ({ role: m.role, content: m.content })),
    { role: 'system', content: renderControl(input.control) },
  ];
  const req: LlmRequest = {
    role: 'tutor',
    system: [
      { text: input.charter ?? PROMPTS.tutorCharter, cache: true },
      { text: input.curriculumContext, cache: true },
    ],
    messages,
    effort: input.effort ?? 'medium',
  };
  // max_tokens must also cover adaptive thinking, so leave the provider default (4096) unless overridden
  if (input.maxTokens !== undefined) req.maxTokens = input.maxTokens;
  if (input.model) req.model = input.model;
  if (input.metadata) req.metadata = input.metadata;
  if (input.signal) req.signal = input.signal;
  return req;
}

export interface CurriculumContextOptions {
  /** Extra grounding spans (e.g. retrieved chunks) beyond the concepts' own spans. */
  spans?: SourceSpan[];
  /** Whether a source document is loaded; when true the tutor is told to cite. Default: any span present. */
  sourcesLoaded?: boolean;
  /** Render the lesson's other concepts briefly (default true). */
  includeOtherConcepts?: boolean;
}

function renderSpan(s: SourceSpan): string {
  const where = [s.page !== undefined ? `p. ${s.page}` : '', s.heading ? `"${s.heading}"` : ''].filter(Boolean).join(', ');
  return `- ${where ? `(${where}) ` : ''}"${s.quote.trim()}"`;
}

function renderConceptFull(c: Concept, extraSpans: SourceSpan[]): string {
  const lines: string[] = [];
  lines.push(`## Concept in focus: ${c.name} (id ${c.id})`, '', `Definition: ${c.definition.trim()}`, '');
  lines.push('### Objectives');
  for (const o of c.objectives) lines.push(`- ${o.id} [${o.bloom}]: ${o.text.trim()}`);
  lines.push('');
  if (c.misconceptions.length > 0) {
    lines.push('### Known misconceptions');
    for (const m of c.misconceptions) lines.push(`- ${m.tag}: ${m.description.trim()} Remedy: ${m.remedy.trim()}`);
    lines.push('');
  }
  if (c.examples.length > 0) {
    lines.push('### Examples');
    for (const e of c.examples) lines.push(`- ${e.title.trim()}${e.domain ? ` (${e.domain})` : ''}: ${e.body.trim()}`);
    lines.push('');
  }
  const spans = [...c.spans, ...extraSpans];
  if (spans.length > 0) {
    lines.push('### Source spans (cite these; do not invent others)');
    for (const s of spans) lines.push(renderSpan(s));
    lines.push('');
  }
  const s = c.script;
  lines.push('### Lesson script');
  lines.push(`Pretest question (pose it; never answer it): ${s.pretest.prompt.trim()}`, '');
  lines.push('Guiding question plan (ask in order; each "expects" is what a good learner answer contains, not text to say):');
  s.guidingQuestions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question.trim()} — expects: ${q.expected.trim()}${q.probesMisconception ? ` [probes: ${q.probesMisconception}]` : ''}`);
  });
  lines.push('');
  lines.push(`Worked example (for faded-example scaffolding and hint level 3): ${s.workedExample.problem.trim()}`);
  s.workedExample.steps.forEach((step, i) => lines.push(`  step ${i + 1}: ${step.trim()}`));
  lines.push('');
  lines.push(`Transfer question (pose it; never answer it): ${s.transfer.prompt.trim()}`, '');
  lines.push('Hint ladder (use only up to the level the control message allows):');
  s.hints.forEach((h, i) => lines.push(`- level ${i + 1}: ${h.trim()}`));
  lines.push('');
  return lines.join('\n');
}

function renderConceptBrief(c: Concept): string {
  const objectives = c.objectives.map((o) => `${o.id}: ${o.text.trim()}`).join('; ');
  return `- ${c.name} (id ${c.id}): ${c.definition.trim()} Objectives: ${objectives}`;
}

/**
 * Render the cached curriculum context for a lesson. Includes definitions, objectives, misconceptions,
 * examples, source spans, the guiding-question plan and hint contents of the focus concept.
 * NEVER includes `script.pretest.reference`, `script.transfer.reference` or any `item.reference`.
 */
export function buildCurriculumContext(lesson: Lesson, focusConceptId: string, opts: CurriculumContextOptions = {}): string {
  const focus = lesson.concepts.find((c) => c.id === focusConceptId) ?? lesson.concepts[0];
  if (!focus) throw new Error('buildCurriculumContext: lesson has no concepts');
  const extra = opts.spans ?? [];
  const anySpans = extra.length > 0 || lesson.concepts.some((c) => c.spans.length > 0);
  const sourcesLoaded = opts.sourcesLoaded ?? anySpans;
  const lines: string[] = [];
  lines.push(`# Lesson ${lesson.ordinal}: ${lesson.title.trim()}`);
  if (lesson.summary) lines.push('', lesson.summary.trim());
  lines.push('');
  lines.push(sourcesLoaded
    ? 'Grounding: a source is loaded. Ground factual claims in the source spans below and cite page or heading. Say when a claim is not covered.'
    : 'Grounding: no source is loaded. Do not cite pages or quotations.');
  lines.push('');
  lines.push(renderConceptFull(focus, extra));
  const others = lesson.concepts.filter((c) => c.id !== focus.id);
  if ((opts.includeOtherConcepts ?? true) && others.length > 0) {
    lines.push('## Other concepts in this lesson');
    for (const c of others) lines.push(renderConceptBrief(c));
    lines.push('');
  }
  const text = lines.join('\n');
  const leaks = referenceLeaks(text, lesson);
  if (leaks.length > 0) throw new Error(`buildCurriculumContext: reference text leaked into context: ${leaks.join(' | ')}`);
  return text;
}

/** All hidden reference strings of a lesson (pretest, transfer, item references). */
export function hiddenReferences(lesson: Lesson): string[] {
  const out: string[] = [];
  for (const c of lesson.concepts) {
    out.push(c.script.pretest.reference, c.script.transfer.reference);
    for (const it of c.items) {
      out.push(it.reference.answer);
      if (it.reference.exact) out.push(it.reference.exact);
      if (it.reference.notes) out.push(it.reference.notes);
    }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Reference strings (≥ 12 chars, to skip trivially short answers like "42") that appear verbatim in `text`. */
export function referenceLeaks(text: string, lesson: Lesson): string[] {
  return hiddenReferences(lesson).filter((r) => r.length >= 12 && text.includes(r));
}
