/**
 * Browser platform: sqlite-wasm in a Worker (OPFS), secrets in IndexedDB, LLM calls either through the
 * server proxy (`/api/anthropic`, default) or directly with the user's own key (BYOK).
 *
 * BYOK mode is remembered in the `llmMode` setting ('byok' | 'proxy'). `setLlmMode` flips it at runtime and
 * updates `llmBaseUrl` in place, so the LLM client can be re-created from the same Platform object.
 */
import { createDb, getSetting, setSetting } from '@epistemics/db';
import { createWebExecutor } from '@epistemics/db/web';
import type { PickedFile, Platform, SecretsStore } from './index.js';

export const PROXY_BASE_URL = '/api/anthropic';
export type LlmMode = 'proxy' | 'byok';

export interface WebPlatform extends Platform {
  readonly kind: 'web';
  /** 'opfs' = persistent; 'memory' = private mode fallback, data lost on reload. */
  readonly storage: 'opfs' | 'memory';
  llmMode: LlmMode;
  setLlmMode(mode: LlmMode): Promise<void>;
  exportDatabase(): Promise<Uint8Array>;
  importDatabase(bytes: Uint8Array): Promise<void>;
}

export async function createWebPlatform(): Promise<WebPlatform> {
  const exec = await createWebExecutor();
  await exec.migrate();
  const db = createDb(exec);
  const initialMode = (await getSetting<LlmMode>(db, 'llmMode')) === 'byok' ? 'byok' : 'proxy';

  const platform: WebPlatform = {
    kind: 'web',
    db: exec,
    storage: exec.storage,
    secrets: createIndexedDbSecrets(),
    llmFetch: (input, init) => globalThis.fetch(input, init),
    llmBaseUrl: initialMode === 'byok' ? undefined : PROXY_BASE_URL,
    llmMode: initialMode,
    async setLlmMode(mode) {
      await setSetting(db, 'llmMode', mode);
      platform.llmMode = mode;
      platform.llmBaseUrl = mode === 'byok' ? undefined : PROXY_BASE_URL;
    },
    files: { pick: pickFiles, saveText: downloadText },
    exportDatabase: () => exec.exportDatabase(),
    importDatabase: (bytes) => exec.importDatabase(bytes),
  };
  return platform;
}

// ---------------- secrets: IndexedDB key/value ----------------

const SECRETS_DB = 'epistemics-secrets';
const SECRETS_STORE = 'secrets';

function openSecretsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SECRETS_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SECRETS_STORE)) req.result.createObjectStore(SECRETS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
    req.onblocked = () => reject(new Error('indexedDB.open blocked'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export function createIndexedDbSecrets(): SecretsStore {
  let dbPromise: Promise<IDBDatabase> | undefined;
  const open = () => (dbPromise ??= openSecretsDb().catch((e) => { dbPromise = undefined; throw e; }));
  const memory = new Map<string, string>(); // fallback when IndexedDB is unavailable (some private modes)
  const available = typeof indexedDB !== 'undefined';
  return {
    async get(key) {
      if (!available) return memory.get(key) ?? null;
      const db = await open();
      const v = await idbRequest(db.transaction(SECRETS_STORE, 'readonly').objectStore(SECRETS_STORE).get(key));
      return typeof v === 'string' ? v : null;
    },
    async set(key, value) {
      if (!available) { memory.set(key, value); return; }
      const db = await open();
      const tx = db.transaction(SECRETS_STORE, 'readwrite');
      await idbRequest(tx.objectStore(SECRETS_STORE).put(value, key));
    },
    async delete(key) {
      if (!available) { memory.delete(key); return; }
      const db = await open();
      const tx = db.transaction(SECRETS_STORE, 'readwrite');
      await idbRequest(tx.objectStore(SECRETS_STORE).delete(key));
    },
  };
}

// ---------------- files ----------------

function pickFiles(accept: string[]): Promise<PickedFile[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (accept.length) input.accept = accept.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => { input.remove(); window.removeEventListener('focus', onFocus); };
    // Browsers fire no event on cancel; treat regaining focus with no files as cancel (after a tick).
    const onFocus = () => setTimeout(() => { if (!input.files?.length) { cleanup(); resolve([]); } }, 400);
    input.onchange = async () => {
      window.removeEventListener('focus', onFocus);
      try {
        const files = Array.from(input.files ?? []);
        const picked: PickedFile[] = [];
        for (const f of files) {
          const p: PickedFile = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
          if (f.type) p.mime = f.type;
          picked.push(p);
        }
        resolve(picked);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        cleanup();
      }
    };
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

async function downloadText(name: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: name.endsWith('.json') ? 'application/json' : 'text/plain' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
