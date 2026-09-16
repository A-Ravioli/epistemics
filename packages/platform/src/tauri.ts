/**
 * Desktop platform (Tauri 2). Database via tauri-plugin-sql, secrets via the OS keychain (Rust commands
 * `secret_get` / `secret_set` / `secret_delete` in apps/desktop), LLM traffic via the `llm_fetch` command so the
 * API key never enters the webview's network layer, and native file dialogs.
 *
 * `llm_fetch` contract (Rust side): `invoke('llm_fetch', { url, method, headers, body, channel })` where
 * `channel: Channel<LlmFetchMessage>` receives, in order: `{ status, headers }`, zero or more `Uint8Array`
 * body chunks, then `{ done: true }`. Errors reject the invoke promise.
 */
import { Channel, invoke } from '@tauri-apps/api/core';
import { createTauriExecutor } from '@epistemics/db/tauri';
import type { PickedFile, Platform, SecretsStore } from './index.js';

export type LlmFetchMessage =
  | { status: number; headers: Record<string, string> | [string, string][]; done?: false }
  | { done: true; status?: number; headers?: Record<string, string> | [string, string][] }
  | Uint8Array
  | number[]
  | ArrayBuffer;

export interface TauriPlatform extends Platform {
  readonly kind: 'tauri';
}

export async function createTauriPlatform(): Promise<TauriPlatform> {
  const exec = await createTauriExecutor();
  await exec.migrate();
  return {
    kind: 'tauri',
    db: exec,
    secrets: createKeychainSecrets(),
    llmFetch: tauriFetch,
    llmBaseUrl: undefined,
    files: { pick: pickFiles, saveText },
  };
}

// ---------------- secrets ----------------

export function createKeychainSecrets(): SecretsStore {
  return {
    async get(key) {
      const v = await invoke<string | null | undefined>('secret_get', { key });
      return v ?? null;
    },
    async set(key, value) {
      await invoke('secret_set', { key, value });
    },
    async delete(key) {
      await invoke('secret_delete', { key });
    },
  };
}

// ---------------- llm fetch over IPC ----------------

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  new Headers(h).forEach((v, k) => { out[k] = v; });
  return out;
}

async function bodyToBytes(body: BodyInit | null | undefined): Promise<number[] | null> {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return Array.from(new TextEncoder().encode(body));
  if (body instanceof Uint8Array) return Array.from(body);
  if (body instanceof ArrayBuffer) return Array.from(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) return Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  // Blob, FormData, URLSearchParams, ReadableStream: normalise through Response
  return Array.from(new Uint8Array(await new Response(body).arrayBuffer()));
}

function toUint8(chunk: Uint8Array | number[] | ArrayBuffer): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return Uint8Array.from(chunk);
}

/**
 * fetch-compatible function routed through the `llm_fetch` Tauri command. Streams the body as it arrives,
 * so SSE streaming from the Anthropic SDK works unchanged. Supports `signal` (aborts the stream; the Rust
 * side is told via `llm_fetch_abort` if it implements it).
 */
export const tauriFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = req.url;
  const method = (init?.method ?? req.method ?? 'GET').toUpperCase();
  const headers = headersToRecord(init?.headers ?? req.headers);
  const body = await bodyToBytes(init?.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(method) ? await req.arrayBuffer() : null));
  const signal = init?.signal ?? req.signal;

  let status = 200;
  let respHeaders = new Headers();
  let headResolve!: () => void;
  let headReject!: (e: Error) => void;
  const head = new Promise<void>((res, rej) => { headResolve = res; headReject = rej; });
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  const buffered: Uint8Array[] = [];
  const requestId = Math.random().toString(36).slice(2);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const b of buffered) c.enqueue(b);
      buffered.length = 0;
      if (closed) c.close();
    },
    cancel() {
      void invoke('llm_fetch_abort', { requestId }).catch(() => {});
    },
  });

  const channel = new Channel<LlmFetchMessage>();
  channel.onmessage = (m) => {
    if (m instanceof Uint8Array || m instanceof ArrayBuffer || Array.isArray(m)) {
      const bytes = toUint8(m);
      if (controller) controller.enqueue(bytes); else buffered.push(bytes);
      return;
    }
    if (m.done) {
      closed = true;
      headResolve();
      try { controller?.close(); } catch { /* already closed */ }
      return;
    }
    status = m.status;
    respHeaders = new Headers(m.headers);
    headResolve();
  };

  const onAbort = () => {
    const err = new DOMException('The operation was aborted.', 'AbortError');
    headReject(err);
    try { controller?.error(err); } catch { /* ignore */ }
    void invoke('llm_fetch_abort', { requestId }).catch(() => {});
  };
  if (signal?.aborted) { onAbort(); throw new DOMException('The operation was aborted.', 'AbortError'); }
  signal?.addEventListener('abort', onAbort, { once: true });

  const call = invoke<void>('llm_fetch', { url, method, headers, body, channel, requestId })
    .then(() => {
      // Command returned: the channel has (or will have) delivered `{ done: true }`. Ensure closure anyway.
      closed = true;
      headResolve();
      try { controller?.close(); } catch { /* already closed */ }
    })
    .catch((e: unknown) => {
      const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e));
      headReject(err);
      try { controller?.error(err); } catch { /* ignore */ }
    })
    .finally(() => signal?.removeEventListener('abort', onAbort));

  await Promise.race([head, call]);
  await head;
  const noBody = status === 204 || status === 304 || method === 'HEAD';
  return new Response(noBody ? null : stream, { status, statusText: '', headers: respHeaders });
};

// ---------------- files ----------------

const EXT_OF: Record<string, string[]> = {
  'application/pdf': ['pdf'], 'application/epub+zip': ['epub'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/markdown': ['md', 'markdown'], 'text/plain': ['txt'], 'application/json': ['json'],
};

function acceptToExtensions(accept: string[]): string[] {
  const out = new Set<string>();
  for (const a of accept) {
    if (a.startsWith('.')) out.add(a.slice(1));
    else for (const e of EXT_OF[a] ?? []) out.add(e);
  }
  return [...out];
}

async function pickFiles(accept: string[]): Promise<PickedFile[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const extensions = acceptToExtensions(accept);
  const selected = await open({ multiple: true, directory: false, filters: extensions.length ? [{ name: 'Documents', extensions }] : [] });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  const out: PickedFile[] = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    const ext = name.split('.').pop()?.toLowerCase();
    const mime = ext ? Object.entries(EXT_OF).find(([, exts]) => exts.includes(ext))?.[0] : undefined;
    const f: PickedFile = { name, bytes };
    if (mime) f.mime = mime;
    out.push(f);
  }
  return out;
}

async function saveText(name: string, text: string): Promise<void> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const ext = name.split('.').pop();
  const path = await save({ defaultPath: name, filters: ext && ext !== name ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (!path) return;
  await writeTextFile(path, text);
}
