import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMockProvider, mockAttemptMade, type LlmRequest } from '../src/index.js';

const req: LlmRequest = { role: 'tutor', system: [{ text: 'charter', cache: true }], messages: [{ role: 'user', content: 'hi', cache: true }, { role: 'user', content: 'what now?' }] };

describe('mock provider', () => {
  it('streams word deltas that rejoin to the full text, then a done event with usage', async () => {
    const mock = createMockProvider({ queue: { tutor: ['One two  three\nfour?'] }, model: 'claude-opus-5' });
    const events = [];
    for await (const ev of mock.stream(req)) events.push(ev);
    const deltas = events.filter((e) => e.type === 'delta');
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.map((e) => e.text).join('')).toBe('One two  three\nfour?');
    const done = events.at(-1)!;
    expect(done.type).toBe('done');
    expect(done.usage!.cacheRead).toBeGreaterThan(0);
    expect(done.usage!.costUsd).toBeGreaterThan(0);
    expect(mock.calls).toHaveLength(1);
  });

  it('consumes queued responses per role in order, then falls back to the responder, then to heuristics', async () => {
    const mock = createMockProvider({ queue: { tutor: ['first', (r) => `second for ${r.role}`] }, respond: (r) => (r.role === 'student' ? 'scripted student?' : undefined) });
    expect((await mock.text(req)).text).toBe('first');
    expect((await mock.text(req)).text).toBe('second for tutor');
    expect((await mock.text(req)).text).toMatch(/\?/); // built-in default
    expect((await mock.text({ ...req, role: 'student' })).text).toBe('scripted student?');
    mock.push('tutor', 'pushed');
    expect((await mock.text(req)).text).toBe('pushed');
    expect(mock.calls).toHaveLength(5);
    mock.reset();
    expect(mock.calls).toHaveLength(0);
  });

  it('structured validates objects and JSON strings against the schema', async () => {
    const mock = createMockProvider({ queue: { grader: ['{"x": 1}', { x: 2 }] } });
    const s = z.object({ x: z.number() });
    expect((await mock.structured({ ...req, role: 'grader' }, s, 'S')).value).toEqual({ x: 1 });
    expect((await mock.structured({ ...req, role: 'grader' }, s, 'S')).value).toEqual({ x: 2 });
    await expect(mock.structured({ ...req, role: 'architect' }, s, 'S')).rejects.toThrow(/no scripted response/);
  });

  it('reports usage to the sink with metadata', async () => {
    const seen: unknown[] = [];
    const mock = createMockProvider({ onUsage: (u) => seen.push(u) });
    await mock.text({ ...req, metadata: { sessionId: 's', courseId: 'c' } });
    expect(seen[0]).toMatchObject({ role: 'tutor', sessionId: 's', courseId: 'c', model: 'mock', costUsd: 0 });
  });

  it('attempt heuristic', () => {
    expect(mockAttemptMade('I think it is 4')).toBe(true);
    expect(mockAttemptMade('idk')).toBe(false);
    expect(mockAttemptMade("I don't know, sorry")).toBe(false);
    expect(mockAttemptMade('no')).toBe(false);
  });
});
