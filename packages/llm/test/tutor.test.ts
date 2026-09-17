import { describe, expect, it } from 'vitest';
import { buildCurriculumContext, buildTutorRequest, hiddenReferences, referenceLeaks, renderControl, PROMPTS, createMockProvider } from '../src/index.js';
import { ITEM_REFERENCE, PRETEST_REFERENCE, TRANSFER_REFERENCE, makeLesson } from './fixtures.js';

const lesson = makeLesson();

describe('buildCurriculumContext', () => {
  const ctx = buildCurriculumContext(lesson, 'c-indep');

  it('renders definitions, objectives, misconceptions, examples, spans, guiding questions and hints', () => {
    expect(ctx).toContain('Independent events');
    expect(ctx).toContain('O1 [understand]');
    expect(ctx).toContain('conflates-independent-and-disjoint');
    expect(ctx).toContain('Two coin flips');
    expect(ctx).toContain('p. 42');
    expect(ctx).toContain('What does it mean for one event to give you information');
    expect(ctx).toContain('level 3: For the deck');
    expect(ctx).toContain('Pretest question (pose it; never answer it)');
    expect(ctx).toContain('Other concepts in this lesson');
    expect(ctx).toContain('Conditional probability');
  });

  it('never contains any reference answer', () => {
    for (const ref of [PRETEST_REFERENCE, TRANSFER_REFERENCE, ITEM_REFERENCE]) expect(ctx).not.toContain(ref);
    for (const ref of hiddenReferences(lesson)) expect(ctx).not.toContain(ref);
    expect(ctx).not.toContain('Accept the multiplication rule'); // item.reference.notes
    expect(referenceLeaks(ctx, lesson)).toEqual([]);
  });

  it('tells the tutor whether sources are loaded', () => {
    expect(ctx).toContain('a source is loaded');
    const bare = { ...lesson, concepts: lesson.concepts.map((c) => ({ ...c, spans: [] })) };
    expect(buildCurriculumContext(bare, 'c-indep')).toContain('no source is loaded');
  });

  it('throws if a template change would leak a reference', () => {
    const poisoned = makeLesson();
    poisoned.concepts[0]!.script.hints[0] = PRETEST_REFERENCE; // a hint that equals the reference
    expect(() => buildCurriculumContext(poisoned, 'c-indep')).toThrow(/leaked/);
  });
});

describe('buildTutorRequest', () => {
  const req = buildTutorRequest({
    curriculumContext: buildCurriculumContext(lesson, 'c-indep'),
    learnerModelText: 'scaffolding=developing; mastered: sample spaces; shaky: conditional probability',
    transcript: [
      { role: 'assistant', content: 'Is drawing a red card and drawing a king independent?' },
      { role: 'user', content: 'I think yes because they are different things.' },
    ],
    control: { phase: 'DEVELOP', conceptId: 'c-indep', hintLevel: 1, maxWords: 120, instruction: 'Ask guiding question 1.', objectiveId: 'O1' },
  });

  it('uses the charter and curriculum context as cached system blocks, in that order', () => {
    expect(req.role).toBe('tutor');
    expect(req.system).toHaveLength(2);
    expect(req.system[0]!.text).toBe(PROMPTS.tutorCharter);
    expect(req.system[0]!.cache).toBe(true);
    expect(req.system[1]!.cache).toBe(true);
    expect(req.system[1]!.text).toContain('Independent events');
  });

  it('opens with the cached learner model, then the transcript, then the control as a trailing system message', () => {
    expect(req.messages[0]).toMatchObject({ role: 'user', cache: true });
    expect(req.messages[0]!.content).toContain('scaffolding=developing');
    expect(req.messages[1]!.role).toBe('assistant');
    expect(req.messages[2]!.role).toBe('user');
    const last = req.messages[req.messages.length - 1]!;
    expect(last.role).toBe('system');
    expect(last.cache).toBeUndefined();
    expect(last.content).toContain('phase=DEVELOP');
    expect(last.content).toContain('hint_level=1');
    expect(last.content).toContain('max_words=120');
    expect(last.content).toContain('objective=O1');
    expect(last.content).toContain('Ask guiding question 1.');
    expect(req.messages.filter((m) => m.cache).length).toBe(1);
  });

  it('defaults to medium effort and leaves max tokens to the provider', () => {
    expect(req.effort).toBe('medium');
    expect(req.maxTokens).toBeUndefined();
    expect(req.temperature).toBeUndefined();
  });

  it('contains no reference answer anywhere', () => {
    const all = [...req.system.map((b) => b.text), ...req.messages.map((m) => m.content)].join('\n');
    for (const ref of hiddenReferences(lesson)) expect(all).not.toContain(ref);
  });

  it('round-trips through the mock provider with one question and a recorded call', async () => {
    const mock = createMockProvider();
    const out = await mock.text(req);
    expect((out.text.match(/\?/g) ?? []).length).toBe(1);
    expect(mock.calls[0]).toBe(req);
  });
});

describe('renderControl', () => {
  it('forbids reveal and hints at level 0', () => {
    const c = renderControl({ phase: 'PRIME', conceptId: 'x', hintLevel: 0, maxWords: 60, instruction: 'Pose the pretest.' });
    expect(c).toContain('reveal=forbidden');
    expect(c).toContain('No hint yet');
    expect(c).toContain('Do not state the answer');
    expect(c).toContain('At most 60 words');
  });
  it('allows hint content by default above level 0 and honours allowHintContent=false', () => {
    expect(renderControl({ phase: 'DEVELOP', conceptId: 'x', hintLevel: 2, maxWords: 120, instruction: 'go' })).toContain('You may use hint level 2');
    expect(renderControl({ phase: 'DEVELOP', conceptId: 'x', hintLevel: 2, maxWords: 120, instruction: 'go', allowHintContent: false })).toContain('do not quote');
  });
  it('drops the no-reveal line when reveal is allowed', () => {
    const c = renderControl({ phase: 'CONSOLIDATE', conceptId: 'x', hintLevel: 3, maxWords: 200, instruction: 'Reveal: ...', revealAllowed: true });
    expect(c).toContain('reveal=allowed');
    expect(c).not.toContain('Do not state the answer');
  });
});
