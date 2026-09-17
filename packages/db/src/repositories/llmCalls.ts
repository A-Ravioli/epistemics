import { and, asc, count, desc, eq, gte, sum } from 'drizzle-orm';
import type { LlmCall, LlmRole } from '@epistemics/core';
import type { Db } from '../client.js';
import { llmCalls } from '../schema.js';
import { batchAll } from './_util.js';
import { dirtyQueries, type WriteOptions } from './_outbox.js';

type Row = typeof llmCalls.$inferSelect;

function rowToCall(r: Row): LlmCall {
  const c: LlmCall = {
    id: r.id, role: r.role as LlmRole, model: r.model, inputTokens: r.inputTokens, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite,
    outputTokens: r.outputTokens, costUsd: r.costUsd, latencyMs: r.latencyMs, createdAt: r.createdAt,
  };
  if (r.sessionId !== null) c.sessionId = r.sessionId;
  if (r.courseId !== null) c.courseId = r.courseId;
  return c;
}

/** Append-only: a re-insert of an existing id is ignored. */
export async function insertLlmCall(db: Db, c: LlmCall, opts: WriteOptions = {}): Promise<void> {
  await batchAll(db, [
    db.insert(llmCalls).values({
      id: c.id, sessionId: c.sessionId ?? null, courseId: c.courseId ?? null, role: c.role, model: c.model,
      inputTokens: c.inputTokens, cacheRead: c.cacheRead, cacheWrite: c.cacheWrite, outputTokens: c.outputTokens,
      costUsd: c.costUsd, latencyMs: c.latencyMs, createdAt: c.createdAt,
    }).onConflictDoNothing(),
    ...dirtyQueries(db, 'llm_calls', [c.id], c.createdAt, opts),
  ]);
}

export async function listLlmCalls(db: Db, opts: { sinceMs?: number; sessionId?: string; limit?: number } = {}): Promise<LlmCall[]> {
  const conds = [];
  if (opts.sinceMs !== undefined) conds.push(gte(llmCalls.createdAt, opts.sinceMs));
  if (opts.sessionId !== undefined) conds.push(eq(llmCalls.sessionId, opts.sessionId));
  const q = db.select().from(llmCalls).where(conds.length ? and(...conds) : undefined).orderBy(desc(llmCalls.createdAt));
  const rows = opts.limit ? await q.limit(opts.limit).all() : await q.all();
  return rows.map(rowToCall);
}

/** Total USD spent on calls created at/after `sinceMs` (0 = all time). */
export async function sumCost(db: Db, sinceMs: number = 0): Promise<number> {
  const row = await db.select({ total: sum(llmCalls.costUsd) }).from(llmCalls).where(gte(llmCalls.createdAt, sinceMs)).get();
  return Number(row?.total ?? 0);
}

export interface RoleUsage {
  role: LlmRole;
  calls: number;
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  outputTokens: number;
  costUsd: number;
  avgLatencyMs: number;
}

export async function usageByRole(db: Db, sinceMs: number = 0): Promise<RoleUsage[]> {
  const rows = await db.select({
    role: llmCalls.role,
    calls: count(),
    inputTokens: sum(llmCalls.inputTokens),
    cacheRead: sum(llmCalls.cacheRead),
    cacheWrite: sum(llmCalls.cacheWrite),
    outputTokens: sum(llmCalls.outputTokens),
    costUsd: sum(llmCalls.costUsd),
    latency: sum(llmCalls.latencyMs),
  }).from(llmCalls).where(gte(llmCalls.createdAt, sinceMs)).groupBy(llmCalls.role).orderBy(asc(llmCalls.role)).all();
  return rows.map((r) => ({
    role: r.role as LlmRole,
    calls: r.calls,
    inputTokens: Number(r.inputTokens ?? 0),
    cacheRead: Number(r.cacheRead ?? 0),
    cacheWrite: Number(r.cacheWrite ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
    costUsd: Number(r.costUsd ?? 0),
    avgLatencyMs: r.calls ? Number(r.latency ?? 0) / r.calls : 0,
  }));
}
