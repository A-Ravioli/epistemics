/**
 * In-memory executor for tests and ephemeral tooling.
 *
 * On Node this is simply the node executor opened on ':memory:' (synchronous `node:sqlite`, no files).
 * In the browser the equivalent is the web executor's automatic in-memory fallback (see web.worker.ts),
 * which is what runs in private-browsing mode or wherever OPFS is unavailable. There is deliberately no
 * pure-JS SQLite here: both runtimes ship a real SQLite (node:sqlite / sqlite-wasm), so a JS reimplementation
 * would only add a third dialect to keep in sync.
 */
import type { DbExecutor } from '../executor.js';
import { createNodeExecutor } from './node.js';

export function createMemoryExecutor(): DbExecutor {
  return createNodeExecutor(':memory:');
}

/** Convenience for tests: fresh in-memory executor with migrations applied. */
export async function createMigratedMemoryExecutor(): Promise<DbExecutor> {
  const exec = createMemoryExecutor();
  await exec.migrate();
  return exec;
}
