/**
 * Generation cache. The app supplies the store (SQLite, IndexedDB, files);
 * the pipeline only needs get/put of JSON strings keyed by a content hash.
 */
import { canonicalJson, sha256 } from '@epistemics/core';

export interface GenCache {
  get(key: string): Promise<string | null>;
  put(key: string, json: string): Promise<void>;
}

/** In-memory cache for tests and one-off runs. */
export class MemoryGenCache implements GenCache {
  readonly store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, json: string): Promise<void> {
    this.store.set(key, json);
  }
}

/** sha256(stage + promptVersion + model + canonicalJson(inputs)). */
export async function cacheKey(stage: string, promptVersion: string, model: string, inputs: unknown): Promise<string> {
  return sha256(`${stage}\n${promptVersion}\n${model}\n${canonicalJson(inputs)}`);
}
