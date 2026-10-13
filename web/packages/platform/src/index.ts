/**
 * Everything that differs between browser and Tauri sits behind this interface.
 * apps/web never imports Tauri directly; it calls `loadPlatform()`, which lazy-imports the right implementation.
 */
import type { DbExecutor } from '@epistemics/db';

export interface SecretsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PickedFile { name: string; bytes: Uint8Array; mime?: string }

export interface Platform {
  readonly kind: 'web' | 'tauri';
  db: DbExecutor;
  secrets: SecretsStore;
  /** fetch used by the LLM client. Web: proxy or direct (BYOK). Tauri: routed through the `llm_fetch` command. */
  llmFetch: typeof fetch;
  files: {
    pick(accept: string[]): Promise<PickedFile[]>;
    saveText(name: string, text: string): Promise<void>;
  };
  /** Base URL for the LLM API. Web proxy mode: "/api/anthropic". Direct/Tauri: undefined (SDK default). */
  llmBaseUrl?: string;
}

export function isTauri(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as { isTauri?: boolean }).isTauri === true
    || typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function loadPlatform(): Promise<Platform> {
  if (isTauri()) {
    const m = await import('./tauri.js');
    return m.createTauriPlatform();
  }
  const m = await import('./web.js');
  return m.createWebPlatform();
}
