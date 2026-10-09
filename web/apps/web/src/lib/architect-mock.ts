/**
 * Schema-valid Architect outputs for the mock provider (demo mode and tests), so a subject-only or
 * material build runs end to end without a key. The stage is detected from the system prompt header
 * ("# Architect: outline stage", ...). Mirrors packages/architect/test/mockProvider.ts in shape, but
 * lives in the app so the llm package stays untouched. Returns undefined for non-architect requests so
 * the mock provider falls back to its built-in tutor/grader heuristics.
 */
import type { LlmRequest } from '@epistemics/llm';

export type ArchitectMockStage = 'outline' | 'concepts' | 'graph' | 'scripts' | 'items' | 'itemcheck';

export interface ArchitectMockOptions {
  units?: number;
  lessonsPerUnit?: number;
  conceptsPerLesson?: number;
}

const STAGE_HEADERS: Record<string, ArchitectMockStage> = {
  outline: 'outline', concepts: 'concepts', graph: 'graph', lesson: 'scripts', item: 'items',
};

/** The architect stage a request belongs to, or undefined when it is not an architect call. */
export function architectStageOf(req: LlmRequest): ArchitectMockStage | undefined {
  const head = req.system[0]?.text.split('\n')[0] ?? '';
  const m = /^# Architect: (\w+)/.exec(head);
  if (!m) return undefined;
  if (head.includes('self-check')) return 'itemcheck';
  return STAGE_HEADERS[m[1] ?? ''];
}

/** The JSON block (or plain string) under a `## name` heading of the rendered user message. */
export function promptSection<T = unknown>(req: LlmRequest, name: string): T | undefined {
  const msg = req.messages[0]?.content ?? '';
  const re = new RegExp(`## ${name}\\n(?:\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`|([^\\n]*))`);
  const m = re.exec(msg);
  if (!m) return undefined;
  if (m[1] !== undefined) return JSON.parse(m[1]) as T;
  return m[2] as unknown as T;
}

const UNIT_THEMES = ['Foundations', 'Core ideas', 'Applications', 'Extensions', 'Synthesis', 'Frontiers'];
const LESSON_THEMES = ['Definitions and notation', 'Key results', 'Worked problems', 'Common pitfalls'];

function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function createArchitectMockResponder(opts: ArchitectMockOptions = {}) {
  const units = opts.units ?? 3;
  const lessons = opts.lessonsPerUnit ?? 2;
  const perLesson = opts.conceptsPerLesson ?? 2;

  return (req: LlmRequest): object | undefined => {
    const stage = architectStageOf(req);
    if (!stage) return undefined;
    switch (stage) {
      case 'outline': {
        const subject = titleCase(promptSection<string>(req, 'subject') ?? 'The subject');
        const sources = promptSection<{ title: string; sections: { chunkIds: string[] }[] }[]>(req, 'sources');
        const allChunkIds = sources?.flatMap((s) => s.sections.flatMap((g) => g.chunkIds)) ?? [];
        let cursor = 0;
        return {
          title: sources?.length ? `${subject} (from ${sources.map((s) => s.title).join(', ')})` : subject,
          description: `A ${units}-unit course on ${subject.toLowerCase()} produced by the demo architect.`,
          assumedReferences: sources?.length ? [] : [`${subject}: A First Course, Demo Author`, `Principles of ${subject}, Demo & Demo`],
          units: Array.from({ length: units }, (_, u) => ({
            title: `${subject}: ${UNIT_THEMES[u % UNIT_THEMES.length]}`,
            summary: `Unit ${u + 1} covers the ${UNIT_THEMES[u % UNIT_THEMES.length]!.toLowerCase()} of ${subject.toLowerCase()}.`,
            lessons: Array.from({ length: lessons }, (_, l) => {
              const ids = allChunkIds.slice(cursor, cursor + 2);
              cursor = Math.min(allChunkIds.length, cursor + 2);
              return {
                title: `${LESSON_THEMES[l % LESSON_THEMES.length]} (${u + 1}.${l + 1})`,
                summary: `What lesson ${u + 1}.${l + 1} of ${subject.toLowerCase()} teaches.`,
                chunkIds: ids,
              };
            }),
          })),
        };
      }
      case 'concepts': {
        const lesson = promptSection<{ title: string }>(req, 'lesson') ?? { title: 'Lesson' };
        const text = promptSection<{ id: string; text: string }[]>(req, 'sourceText') ?? [];
        const first = text[0];
        const spans = first ? [{ chunkId: first.id, quote: first.text.slice(0, 40), page: 1 }] : [];
        return {
          concepts: Array.from({ length: perLesson }, (_, i) => ({
            name: `${lesson.title} concept ${i + 1}`,
            definition: `Concept ${i + 1} of ${lesson.title} states that the key quantity is determined by its defining relation and behaves predictably under the standard operations.`,
            objectives: [{ bloom: 'understand', text: 'Explain the idea in your own words.' }, { bloom: 'apply', text: 'Use it on a new example.' }],
            misconceptions: [{ tag: 'mixes-things-up', description: 'Confuses this concept with its neighbour.', remedy: 'Ask for a counterexample that separates the two.' }],
            examples: [{ title: 'Everyday example', body: 'A concrete case from daily life.', domain: 'everyday' }, { title: 'Technical example', body: 'A worked technical case.' }],
            spans,
          })),
        };
      }
      case 'graph': {
        const fresh = (promptSection<{ id: string }[]>(req, 'new') ?? []).map((c) => c.id);
        const known = (promptSection<{ id: string }[]>(req, 'known') ?? []).map((c) => c.id);
        const edges: object[] = [];
        for (let i = 1; i < fresh.length; i++) {
          edges.push({ from: fresh[i - 1], to: fresh[i], kind: 'prereq', justification: 'builds on the previous concept', confidence: 0.8 });
        }
        if (known.length && fresh.length) {
          edges.push({ from: known[known.length - 1], to: fresh[0], kind: 'prereq', justification: 'continues the sequence', confidence: 0.7 });
        }
        return { edges };
      }
      case 'scripts': {
        const concept = promptSection<{ name: string }>(req, 'concept') ?? { name: 'the concept' };
        return {
          pretest: { prompt: `Before we start: how would you describe ${concept.name}?`, isomorph: `In one sentence, what is ${concept.name} about?`, reference: `${concept.name} is defined by its defining relation and behaves predictably under the standard operations.` },
          guidingQuestions: [
            { question: 'What do you already know that looks like this?', expected: 'A related prior idea', probesMisconception: 'mixes-things-up' },
            { question: 'What is the defining relation here?', expected: 'States the defining relation' },
            { question: 'What happens under the standard operations?', expected: 'Predictable behaviour' },
          ],
          workedExample: { problem: `Apply ${concept.name} to a small case.`, steps: ['Identify the quantities.', 'Apply the defining relation.', 'Now you: check the result under the standard operations.'] },
          transfer: { prompt: `Where else would ${concept.name} apply?`, reference: 'Any setting with the same defining relation.' },
          hints: ['Think about the defining relation.', 'Write the relation down for this case.', 'The relation gives the quantity directly; substitute and simplify.'],
        };
      }
      case 'items': {
        const regen = promptSection<{ count: number }>(req, 'regenerate');
        const concept = promptSection<{ name: string }>(req, 'concept') ?? { name: 'the concept' };
        const text = promptSection<{ id: string; text: string }[]>(req, 'sourceText') ?? [];
        const first = text[0];
        const spans = first ? [{ chunkId: first.id, quote: first.text.slice(5, 30) }] : [];
        const rubric = [{ text: 'States the defining relation' }, { text: 'Names the key quantity', evidenceHint: 'the quantity is named' }, { text: 'Explains the behaviour under operations' }];
        if (regen) {
          return { items: Array.from({ length: regen.count }, (_, i) => ({ type: 'explain', bloom: 'understand', prompt: `Replacement ${i + 1}: explain ${concept.name}.`, reference: { answer: 'The defining relation determines the key quantity.' }, rubric, spans })) };
        }
        return {
          items: [
            { type: 'recall', bloom: 'remember', prompt: `Define ${concept.name}.`, reference: { answer: 'The key quantity is determined by its defining relation.' }, rubric: [], spans },
            { type: 'cloze', bloom: 'remember', prompt: `${concept.name} says the key quantity is determined by its ___.`, reference: { answer: 'defining relation' }, rubric: [], spans },
            { type: 'explain', bloom: 'understand', prompt: `Explain ${concept.name} to a peer.`, reference: { answer: 'The key quantity is determined by its defining relation and behaves predictably under the standard operations.' }, rubric, spans, tags: ['mixes-things-up'] },
            { type: 'apply', bloom: 'apply', prompt: `Apply ${concept.name} to the case of 3 and 4.`, reference: { answer: 'Substitute into the defining relation to get 7.', exact: '7' }, rubric, spans },
            { type: 'teachback', bloom: 'apply', prompt: `Teach ${concept.name} to a curious student.`, reference: { answer: 'A good explanation states the defining relation and shows one example.' }, rubric, spans },
            { type: 'predict', bloom: 'understand', prompt: `Predict what ${concept.name} gives when the input doubles.`, reference: { answer: 'The output follows the defining relation for the doubled input.' }, rubric: [], spans },
          ],
        };
      }
      case 'itemcheck': {
        const items = promptSection<{ index: number; prompt: string }[]>(req, 'items') ?? [];
        return { results: items.map((it) => ({ index: it.index, attemptedAnswer: 'attempt', answerable: true, ambiguous: false, issues: [] })) };
      }
    }
  };
}
