/** Scripted LlmProvider stub: routes by the stage header of the system prompt and answers with canned JSON. */
import type { z } from 'zod';
import type { LlmProvider, LlmRequest, StreamEvent, Usage } from '@epistemics/llm';

export type Stage = 'outline' | 'concepts' | 'graph' | 'scripts' | 'items' | 'itemcheck';

const usage: Usage = { inputTokens: 1, cacheRead: 0, cacheWrite: 0, outputTokens: 1, costUsd: 0, latencyMs: 0, model: 'mock' };

export function stageOf(req: LlmRequest): Stage {
  const head = req.system[0]?.text.split('\n')[0] ?? '';
  const m = /^# Architect: (\w+)/.exec(head);
  const map: Record<string, Stage> = { outline: 'outline', concepts: 'concepts', graph: 'graph', lesson: 'scripts', item: 'items' };
  if (head.includes('self-check')) return 'itemcheck';
  const key = m?.[1] ?? '';
  const stage = map[key];
  if (!stage) throw new Error(`mock: unknown stage header "${head}"`);
  return stage;
}

/** Extract the JSON block (or string) under a `## name` heading of the rendered user message. */
export function section<T = unknown>(req: LlmRequest, name: string): T | undefined {
  const msg = req.messages[0]?.content ?? '';
  const re = new RegExp(`## ${name}\\n(?:\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`|([^\\n]*))`);
  const m = re.exec(msg);
  if (!m) return undefined;
  if (m[1] !== undefined) return JSON.parse(m[1]) as T;
  return m[2] as unknown as T;
}

export interface MockOptions {
  units?: number;
  lessonsPerUnit?: number;
  conceptsPerLesson?: number;
  /** First items call for a concept includes one item the checker flags. */
  flagOne?: boolean;
  /** Custom graph edges given the new concept ids (in order). */
  edges?: (newIds: string[], knownIds: string[]) => unknown[];
}

export interface MockProvider extends LlmProvider {
  calls: { stage: Stage; req: LlmRequest }[];
  count(stage?: Stage): number;
}

export function createMockProvider(opts: MockOptions = {}): MockProvider {
  const units = opts.units ?? 2;
  const lessons = opts.lessonsPerUnit ?? 2;
  const perLesson = opts.conceptsPerLesson ?? 2;
  const calls: MockProvider['calls'] = [];

  const answer = (stage: Stage, req: LlmRequest): unknown => {
    switch (stage) {
      case 'outline': {
        const sources = section<{ sections: { chunkIds: string[] }[] }[]>(req, 'sources');
        const allChunkIds = sources?.flatMap((s) => s.sections.flatMap((g) => g.chunkIds)) ?? [];
        return {
          title: 'Probability Basics',
          description: 'A short probability course.',
          assumedReferences: sources ? [] : ['Introduction to Probability, Blitzstein & Hwang', 'A First Course in Probability, Ross'],
          units: Array.from({ length: units }, (_, u) => ({
            title: `Unit ${u + 1}`,
            summary: `Summary of unit ${u + 1}.`,
            lessons: Array.from({ length: lessons }, (_, l) => ({
              title: `Lesson ${u + 1}.${l + 1}`,
              summary: `What lesson ${u + 1}.${l + 1} teaches.`,
              chunkIds: allChunkIds.slice(0, 2),
            })),
          })),
        };
      }
      case 'concepts': {
        const lesson = section<{ title: string }>(req, 'lesson')!;
        const text = section<{ id: string; text: string }[]>(req, 'sourceText') ?? [];
        const spans = text.length
          ? [
              { chunkId: text[0]!.id, quote: text[0]!.text.slice(0, 40), page: 1, heading: 'H' },
              { chunkId: text[0]!.id, quote: 'this quote was never in the source' },
              { chunkId: 'no-such-chunk', quote: text[0]!.text.slice(0, 10) },
            ]
          : [{ chunkId: 'invented', quote: 'invented citation' }];
        return {
          concepts: Array.from({ length: perLesson }, (_, i) => ({
            name: `${lesson.title} concept ${i + 1}`,
            definition: `Definition of concept ${i + 1} in ${lesson.title}.`,
            objectives: [{ bloom: 'understand', text: 'Explain it.' }, { bloom: 'apply', text: 'Use it.' }],
            misconceptions: [{ tag: 'Mixes Things Up', description: 'Confuses A with B.', remedy: 'Ask for a counterexample.' }],
            examples: [{ title: 'Finance', body: 'x', domain: 'finance' }, { title: 'Genetics', body: 'y', domain: 'genetics' }],
            spans,
          })),
        };
      }
      case 'graph': {
        const fresh = section<{ id: string }[]>(req, 'new')!.map((c) => c.id);
        const known = section<{ id: string }[]>(req, 'known')!.map((c) => c.id);
        if (opts.edges) return { edges: opts.edges(fresh, known) };
        const edges: unknown[] = [];
        for (let i = 1; i < fresh.length; i++) {
          edges.push({ from: fresh[i - 1], to: fresh[i], kind: 'prereq', justification: 'builds on', confidence: 0.9 });
        }
        if (fresh.length > 1) edges.push({ from: fresh[1], to: fresh[0], kind: 'encompasses', justification: 'practises', confidence: 0.7, weight: 0.9 });
        edges.push({ from: fresh[0], to: 'unknown-id', kind: 'prereq', justification: 'bogus', confidence: 0.3 });
        if (known.length) edges.push({ from: known[known.length - 1], to: fresh[0], kind: 'prereq', justification: 'continues', confidence: 0.8 });
        return { edges };
      }
      case 'scripts':
        return {
          pretest: { prompt: 'Try this first.', isomorph: 'Try this variant.', reference: 'The answer.' },
          guidingQuestions: [
            { question: 'Q1?', expected: 'E1', probesMisconception: 'mixes-things-up' },
            { question: 'Q2?', expected: 'E2' },
            { question: 'Q3?', expected: 'E3' },
          ],
          workedExample: { problem: 'P', steps: ['s1', 's2', 'Now you: s3'] },
          transfer: { prompt: 'Transfer?', reference: 'Transfer ref.' },
          hints: ['h1', 'h2', 'h3 partial'],
        };
      case 'items': {
        const regen = section<{ count: number }>(req, 'regenerate');
        const concept = section<{ name: string }>(req, 'concept')!;
        const text = section<{ id: string; text: string }[]>(req, 'sourceText') ?? [];
        const spans = text.length ? [{ chunkId: text[0]!.id, quote: text[0]!.text.slice(5, 30) }] : [];
        const rubric = [{ text: 'c1' }, { text: 'c2', evidenceHint: 'e' }, { text: 'c3' }];
        if (regen) {
          return { items: Array.from({ length: regen.count }, (_, i) => ({ type: 'explain', bloom: 'understand', prompt: `Replacement ${i} for ${concept.name}`, reference: { answer: 'r' }, rubric, spans })) };
        }
        const items = [
          { type: 'recall', bloom: 'remember', prompt: `Define ${concept.name}`, reference: { answer: 'def' }, rubric: [{ text: 'ignored' }], spans },
          { type: 'cloze', bloom: 'remember', prompt: `${concept.name} is ___.`, reference: { answer: 'x' }, rubric: [], spans },
          { type: 'explain', bloom: 'understand', prompt: `Explain ${concept.name}`, reference: { answer: 'e' }, rubric, spans, tags: ['mixes-things-up'] },
          { type: 'apply', bloom: 'apply', prompt: `Apply ${concept.name} to 3 and 4`, reference: { answer: '7', exact: '7' }, rubric, spans },
          { type: 'teachback', bloom: 'apply', prompt: `Teach ${concept.name}`, reference: { answer: 't' }, rubric, spans },
          { type: 'predict', bloom: 'understand', prompt: `Predict ${concept.name}`, reference: { answer: 'p' }, rubric: [], spans },
        ];
        if (opts.flagOne) items.push({ type: 'explain', bloom: 'understand', prompt: `AMBIG ${concept.name}`, reference: { answer: 'a' }, rubric, spans });
        return { items };
      }
      case 'itemcheck': {
        const items = section<{ index: number; prompt: string }[]>(req, 'items')!;
        return {
          results: items.map((it) => ({
            index: it.index,
            attemptedAnswer: 'attempt',
            answerable: true,
            ambiguous: it.prompt.startsWith('AMBIG'),
            issues: it.prompt.startsWith('AMBIG') ? ['two readings'] : [],
          })),
        };
      }
    }
  };

  return {
    name: 'mock',
    calls,
    count: (stage) => calls.filter((c) => !stage || c.stage === stage).length,
    async structured<T>(req: LlmRequest, schema: z.ZodType<T>, _name: string) {
      const stage = stageOf(req);
      calls.push({ stage, req });
      return { value: schema.parse(answer(stage, req)), usage };
    },
    async text() {
      return { text: '', usage };
    },
    async *stream(): AsyncIterable<StreamEvent> {
      yield { type: 'done', usage };
    },
  };
}
