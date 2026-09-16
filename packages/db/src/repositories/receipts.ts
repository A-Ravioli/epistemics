import { and, asc, eq, gte } from 'drizzle-orm';
import type { Confidence, GradeResult, Rating, Receipt } from '@epistemics/core';
import type { Db } from '../client.js';
import { receipts } from '../schema.js';
import { bool, int, parseJson, toJson } from './_util.js';

type Row = typeof receipts.$inferSelect;

function rowToReceipt(r: Row): Receipt {
  const x: Receipt = {
    id: r.id, sessionId: r.sessionId, courseId: r.courseId, itemId: r.itemId, conceptId: r.conceptId,
    answer: r.answer, rating: r.rating as Rating, assisted: bool(r.assisted), disputed: bool(r.disputed), createdAt: r.createdAt,
  };
  if (r.confidence !== null) x.confidence = r.confidence as Confidence;
  if (r.gradeJson !== null) x.grade = parseJson<GradeResult | undefined>(r.gradeJson, undefined);
  return x;
}

export async function saveReceipt(db: Db, r: Receipt): Promise<void> {
  const row: typeof receipts.$inferInsert = {
    id: r.id, sessionId: r.sessionId, courseId: r.courseId, itemId: r.itemId, conceptId: r.conceptId,
    answer: r.answer, confidence: r.confidence ?? null, gradeJson: r.grade === undefined ? null : toJson(r.grade),
    rating: r.rating, assisted: int(r.assisted), disputed: int(r.disputed), createdAt: r.createdAt,
  };
  const { id: _id, ...set } = row;
  await db.insert(receipts).values(row).onConflictDoUpdate({ target: receipts.id, set }).run();
}

export async function getReceipt(db: Db, id: string): Promise<Receipt | undefined> {
  const row = await db.select().from(receipts).where(eq(receipts.id, id)).get();
  return row ? rowToReceipt(row) : undefined;
}

export async function getReceipts(db: Db, courseId: string, since?: number): Promise<Receipt[]> {
  const where = since === undefined ? eq(receipts.courseId, courseId) : and(eq(receipts.courseId, courseId), gte(receipts.createdAt, since));
  const rows = await db.select().from(receipts).where(where).orderBy(asc(receipts.createdAt)).all();
  return rows.map(rowToReceipt);
}

export async function getReceiptsForSession(db: Db, sessionId: string): Promise<Receipt[]> {
  const rows = await db.select().from(receipts).where(eq(receipts.sessionId, sessionId)).orderBy(asc(receipts.createdAt)).all();
  return rows.map(rowToReceipt);
}

export async function setReceiptDisputed(db: Db, id: string, disputed: boolean): Promise<void> {
  await db.update(receipts).set({ disputed: int(disputed) }).where(eq(receipts.id, id)).run();
}
