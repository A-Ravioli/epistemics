import { describe, expect, it } from 'vitest';
import { buildWarmupPrompt, mapWarmupResult } from '../../src/session/warmup.js';
import { lesson1 } from './fixture.js';

describe('warm-up', () => {
  it('builds a free-recall prompt that names the lesson but no concepts', () => {
    const p = buildWarmupPrompt(lesson1);
    expect(p).toContain('Lesson One');
    for (const c of lesson1.concepts) expect(p).not.toContain(c.name);
  });

  it('maps recalled concepts to Good reviews and queues the rest first', () => {
    expect(mapWarmupResult(['c2', 'zzz'], lesson1)).toEqual({ reviewed: [{ conceptId: 'c2', rating: 3 }], queuedFirst: ['c1', 'c3'] });
  });
});
