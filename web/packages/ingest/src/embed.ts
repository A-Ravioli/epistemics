/**
 * Embeddings and brute-force retrieval.
 *
 * - `createHashEmbedder`: deterministic hashed bag-of-words (unigrams +
 *   bigrams, signed feature hashing, L2-normalised). Works everywhere with no
 *   model download; used by tests and as the fallback retriever.
 * - `createTransformersEmbedder`: lazily imports `@huggingface/transformers`
 *   (an optional dependency the app may install) and runs a sentence embedder.
 */
import type { Chunk } from '@epistemics/core';

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
  dim: number;
}

// ---------------------------------------------------------------------------
// Hash embedder
// ---------------------------------------------------------------------------

function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'is', 'are', 'for', 'on', 'with', 'as', 'by', 'at', 'it', 'be', 'that', 'this']);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP.has(t));
}

export function createHashEmbedder(dim = 256): Embedder {
  const embedOne = (text: string): Float32Array => {
    const v = new Float32Array(dim);
    const toks = tokenize(text);
    const add = (feature: string, weight: number) => {
      const h = fnv1a(feature);
      const idx = h % dim;
      const sign = fnv1a(feature, 0x9747b28c) & 1 ? 1 : -1;
      v[idx] = v[idx]! + sign * weight;
    };
    for (let i = 0; i < toks.length; i++) {
      add(toks[i]!, 1);
      if (i + 1 < toks.length) add(`${toks[i]}_${toks[i + 1]}`, 0.5);
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += v[i]! * v[i]!;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dim; i++) v[i] = v[i]! / norm;
    return v;
  };
  return {
    dim,
    async embed(texts) {
      return texts.map(embedOne);
    },
  };
}

// ---------------------------------------------------------------------------
// transformers.js embedder (optional dependency)
// ---------------------------------------------------------------------------

export interface TransformersEmbedderOptions {
  /** Expected output dimension before the model is loaded (bge-small: 384). */
  dim?: number;
  /** Extra options passed to `pipeline()` (e.g. `{ device: 'webgpu', dtype: 'fp32' }`). */
  pipelineOptions?: Record<string, unknown>;
  batchSize?: number;
}

type FeaturePipeline = (
  input: string[],
  opts: { pooling: 'mean' | 'cls'; normalize: boolean },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

export function createTransformersEmbedder(
  modelId = 'Xenova/bge-small-en-v1.5',
  opts: TransformersEmbedderOptions = {},
): Embedder {
  let loading: Promise<FeaturePipeline> | undefined;
  const batchSize = opts.batchSize ?? 16;
  const load = (): Promise<FeaturePipeline> => {
    loading ??= (async () => {
      const spec = '@huggingface/transformers';
      let mod: { pipeline: (task: string, model: string, o?: Record<string, unknown>) => Promise<FeaturePipeline> };
      try {
        mod = (await import(/* @vite-ignore */ spec)) as typeof mod;
      } catch (err) {
        throw new Error(
          `createTransformersEmbedder: '@huggingface/transformers' is not installed. ` +
            `Install it (pnpm add @huggingface/transformers) or use createHashEmbedder(). (${String(err)})`,
        );
      }
      return mod.pipeline('feature-extraction', modelId, opts.pipelineOptions);
    })();
    return loading;
  };
  const embedder: Embedder = {
    dim: opts.dim ?? 384,
    async embed(texts) {
      if (!texts.length) return [];
      const pipe = await load();
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const res = await pipe(batch, { pooling: 'mean', normalize: true });
        const d = res.dims[res.dims.length - 1] ?? embedder.dim;
        embedder.dim = d;
        const data = res.data instanceof Float32Array ? res.data : Float32Array.from(res.data);
        for (let j = 0; j < batch.length; j++) out.push(data.slice(j * d, (j + 1) * d));
      }
      return out;
    },
  };
  return embedder;
}

// ---------------------------------------------------------------------------
// Similarity search
// ---------------------------------------------------------------------------

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function cosineTopK(query: Float32Array, vectors: Float32Array[], k: number): { index: number; score: number }[] {
  const scored = vectors.map((v, index) => ({ index, score: cosine(query, v) }));
  scored.sort((x, y) => y.score - x.score || x.index - y.index);
  return scored.slice(0, Math.max(0, k));
}

/** Top-k chunks by cosine similarity. `embeddings[i]` must correspond to `chunks[i]`. */
export function retrieveChunks(chunks: Chunk[], embeddings: Float32Array[], queryEmbedding: Float32Array, k: number): Chunk[] {
  if (embeddings.length !== chunks.length) throw new Error('retrieveChunks: chunks/embeddings length mismatch');
  return cosineTopK(queryEmbedding, embeddings, k).map((r) => chunks[r.index]!);
}
