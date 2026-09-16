/**
 * Builds the LlmProvider from settings.
 *  - 'anthropic': BYOK (key from platform.secrets 'anthropic_api_key', direct browser access) or the
 *    server proxy (platform.llmBaseUrl, key injected server-side / by the Tauri command).
 *  - 'ollama': local model through the same injected fetch.
 *  - 'mock': deterministic demo provider; the default when no key is configured.
 * Every call is logged to `llm_calls` through a UsageSink.
 */
import type { Db } from '@epistemics/db';
import { insertLlmCall, listLlmCalls } from '@epistemics/db';
import { uuidv7 } from '@epistemics/core';
import {
  combineSinks,
  createAnthropicProvider,
  createMockProvider,
  createOllamaProvider,
  createUsageLedger,
  type LlmProvider,
  type UsageLedger,
  type UsageSink,
} from '@epistemics/llm';
import type { Platform } from '@epistemics/platform';
import { createArchitectMockResponder } from './architect-mock.js';
import type { LlmSettings } from './settings.js';

/** Demo provider: the built-in tutor/grader heuristics plus schema-valid Architect outputs so builds run without a key. */
function mockProvider(onUsage: UsageSink, delayMs: number): LlmProvider {
  return createMockProvider({ onUsage, delayMs, respond: createArchitectMockResponder() });
}

export const API_KEY_SECRET = 'anthropic_api_key';

export interface LlmRuntime {
  provider: LlmProvider;
  /** Effective mode after fallbacks ('mock' when anthropic was requested without a key). */
  mode: LlmSettings['mode'];
  /** Human-readable reason for a fallback, shown in the banner. */
  note?: string;
  ledger: UsageLedger;
}

export function dbUsageSink(db: Db): UsageSink {
  return (call) => {
    const now = Date.now();
    void insertLlmCall(db, {
      id: uuidv7(now),
      sessionId: call.sessionId,
      courseId: call.courseId,
      role: call.role,
      model: call.model,
      inputTokens: call.inputTokens,
      cacheRead: call.cacheRead,
      cacheWrite: call.cacheWrite,
      outputTokens: call.outputTokens,
      costUsd: call.costUsd,
      latencyMs: call.latencyMs,
      createdAt: now,
    }).catch((e: unknown) => console.warn('[llm] failed to log call', e));
  };
}

/** Today's persisted calls, so the budget guard survives a reload. */
async function preloadLedger(db: Db, ledger: UsageLedger): Promise<void> {
  try {
    const calls = await listLlmCalls(db, { sinceMs: ledger.startOfToday() });
    ledger.load(calls.map((c) => ({
      role: c.role, model: c.model, inputTokens: c.inputTokens, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite,
      outputTokens: c.outputTokens, costUsd: c.costUsd, latencyMs: c.latencyMs, sessionId: c.sessionId, courseId: c.courseId, at: c.createdAt,
    })));
  } catch (e) {
    console.warn('[llm] could not preload usage ledger', e);
  }
}

export async function buildProvider(platform: Platform, db: Db, settings: LlmSettings, opts: { mockDelayMs?: number } = {}): Promise<LlmRuntime> {
  const ledger = createUsageLedger();
  await preloadLedger(db, ledger);
  const onUsage = combineSinks(ledger.record, dbUsageSink(db));

  if (settings.mode === 'anthropic') {
    if (settings.transport === 'proxy' && platform.llmBaseUrl) {
      return {
        mode: 'anthropic',
        ledger,
        provider: createAnthropicProvider({ baseURL: platform.llmBaseUrl, fetch: platform.llmFetch, models: settings.models, onUsage }),
      };
    }
    if (platform.kind === 'tauri') {
      // The desktop command injects the key from the keychain; no key ever reaches JS.
      return { mode: 'anthropic', ledger, provider: createAnthropicProvider({ fetch: platform.llmFetch, models: settings.models, onUsage }) };
    }
    const apiKey = await platform.secrets.get(API_KEY_SECRET);
    if (apiKey) {
      return {
        mode: 'anthropic',
        ledger,
        provider: createAnthropicProvider({ apiKey, browser: true, fetch: platform.llmFetch, models: settings.models, onUsage }),
      };
    }
    return {
      mode: 'mock',
      ledger,
      note: 'No Anthropic API key configured; using the demo tutor.',
      provider: mockProvider(onUsage, opts.mockDelayMs ?? 12),
    };
  }

  if (settings.mode === 'ollama') {
    return {
      mode: 'ollama',
      ledger,
      provider: createOllamaProvider({ baseURL: settings.ollamaBaseUrl, model: settings.ollamaModel, fetch: platform.llmFetch, onUsage }),
    };
  }

  return { mode: 'mock', ledger, provider: mockProvider(onUsage, opts.mockDelayMs ?? 12) };
}
