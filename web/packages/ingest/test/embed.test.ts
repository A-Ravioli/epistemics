import { describe, expect, it } from 'vitest';
import { cosine, cosineTopK, createHashEmbedder, createTransformersEmbedder, retrieveChunks } from '../src/index.js';
import type { Chunk } from '@epistemics/core';

describe('hash embedder', () => {
  it('is deterministic, unit-norm and ranks related text higher', async () => {
    const e = createHashEmbedder(128);
    const [a, b, c, a2] = await e.embed([
      'the probability of independent events',
      'independent events and their probability',
      'how to cook pasta al dente',
      'the probability of independent events',
    ]);
    expect(a!.length).toBe(128);
    expect(Array.from(a!)).toEqual(Array.from(a2!));
    const norm = Math.sqrt(a!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(cosine(a!, b!)).toBeGreaterThan(cosine(a!, c!));
    expect(cosine(a!, b!)).toBeGreaterThan(0.5);
    expect(Math.abs(cosine(a!, c!))).toBeLessThan(0.3);
    expect(cosineTopK(a!, [c!, b!, a2!], 2)).toEqual([
      { index: 2, score: expect.closeTo(1, 5) },
      { index: 1, score: expect.any(Number) },
    ]);
  });

  it('retrieveChunks returns the closest chunks', async () => {
    const e = createHashEmbedder();
    const texts = ['Bayes rule updates beliefs', 'Matrix multiplication is associative', 'Prior and posterior in Bayesian inference'];
    const chunks: Chunk[] = texts.map((text, i) => ({ id: `c${i}`, sourceId: 's', ordinal: i, headingPath: [], text, tokenCount: 5, hash: `h${i}` }));
    const vecs = await e.embed(texts);
    const [q] = await e.embed(['bayesian posterior beliefs']);
    const top = retrieveChunks(chunks, vecs, q!, 2);
    expect(top.map((c) => c.id).sort()).toEqual(['c0', 'c2']);
    expect(() => retrieveChunks(chunks, vecs.slice(1), q!, 1)).toThrow();
  });

  it('transformers embedder fails with a clear error when the package is absent', async () => {
    const e = createTransformersEmbedder();
    expect(e.dim).toBe(384);
    await expect(e.embed(['x'])).rejects.toThrow(/@huggingface\/transformers/);
    expect(await e.embed([])).toEqual([]);
  });
});
