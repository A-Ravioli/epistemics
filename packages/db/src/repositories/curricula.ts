/**
 * Content repository. The `curricula.curriculum_json` column is the source of truth for a curriculum
 * version; `concepts`, `items` and `concept_edges` are denormalised projections rebuilt on every save so
 * the learner side can look up a concept/item by id without loading the whole pack.
 *
 * Note: `concepts.id` / `items.id` are global primary keys (stable ids). If a new curriculum version reuses
 * a concept id, the projection row is re-pointed at the newest saved version; the full JSON of every version
 * stays intact in `curricula`.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Concept, ConceptEdge, Curriculum, CurriculumManifest, Item } from '@epistemics/core';
import type { Db } from '../client.js';
import { curricula, concepts, items, conceptEdges } from '../schema.js';
import { batchAll, parseJson, toJson } from './_util.js';

type ConceptRow = typeof concepts.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type EdgeRow = typeof conceptEdges.$inferSelect;

/** Concept JSON stored without its items (items live in their own table). */
type ConceptShell = Omit<Concept, 'items'>;

export function edgeId(curriculumId: string, version: number, e: ConceptEdge): string {
  return `${curriculumId}@${version}:${e.from}>${e.to}:${e.kind}`;
}

export function* iterateConcepts(c: Curriculum): Generator<{ concept: Concept; unitId: string; lessonId: string }> {
  for (const u of c.units) for (const l of u.lessons) for (const concept of l.concepts) yield { concept, unitId: u.id, lessonId: l.id };
}

export function* iterateItems(c: Curriculum): Generator<Item> {
  for (const { concept } of iterateConcepts(c)) for (const item of concept.items) yield item;
}

export async function saveCurriculum(db: Db, curriculum: Curriculum, now: number = Date.now()): Promise<void> {
  const m = curriculum.manifest;
  const id = m.id;
  const version = m.version;
  const scope = (t: { curriculumId: ConceptRow['curriculumId'] extends string ? typeof concepts.curriculumId : never }) => t;
  void scope;

  const queries: Parameters<typeof batchAll>[1] = [];
  queries.push(
    db.insert(curricula).values({
      id, version,
      title: m.title, subject: m.subject, contentHash: m.contentHash,
      manifestJson: toJson(m), curriculumJson: toJson(curriculum),
      frozenAt: null, createdAt: now, updatedAt: now, deletedAt: null,
    }).onConflictDoUpdate({
      target: [curricula.id, curricula.version],
      set: { title: m.title, subject: m.subject, contentHash: m.contentHash, manifestJson: toJson(m), curriculumJson: toJson(curriculum), updatedAt: now, deletedAt: null },
    }),
    db.delete(concepts).where(and(eq(concepts.curriculumId, id), eq(concepts.curriculumVersion, version))),
    db.delete(items).where(and(eq(items.curriculumId, id), eq(items.curriculumVersion, version))),
    db.delete(conceptEdges).where(and(eq(conceptEdges.curriculumId, id), eq(conceptEdges.curriculumVersion, version))),
  );

  for (const { concept, unitId, lessonId } of iterateConcepts(curriculum)) {
    const { items: conceptItems, ...shell } = concept;
    const row: typeof concepts.$inferInsert = {
      id: concept.id, curriculumId: id, curriculumVersion: version, unitId, lessonId,
      ordinal: concept.ordinal, name: concept.name, json: toJson(shell satisfies ConceptShell),
    };
    const { id: _cid, ...conceptSet } = row;
    queries.push(db.insert(concepts).values(row).onConflictDoUpdate({ target: concepts.id, set: conceptSet }));
    for (const item of conceptItems) {
      const irow: typeof items.$inferInsert = {
        id: item.id, conceptId: concept.id, curriculumId: id, curriculumVersion: version,
        type: item.type, bloom: item.bloom, hash: item.hash, json: toJson(item),
      };
      const { id: _iid, ...itemSet } = irow;
      queries.push(db.insert(items).values(irow).onConflictDoUpdate({ target: items.id, set: itemSet }));
    }
  }
  for (const e of curriculum.edges) {
    const erow: typeof conceptEdges.$inferInsert = {
      id: edgeId(id, version, e), curriculumId: id, curriculumVersion: version,
      fromId: e.from, toId: e.to, kind: e.kind,
      weight: e.weight ?? null, justification: e.justification ?? null, confidence: e.confidence ?? null,
    };
    const { id: _eid, ...edgeSet } = erow;
    queries.push(db.insert(conceptEdges).values(erow).onConflictDoUpdate({ target: conceptEdges.id, set: edgeSet }));
  }
  await batchAll(db, queries);
}

export async function getCurriculum(db: Db, id: string, version: number): Promise<Curriculum | undefined> {
  const row = await db.select({ json: curricula.curriculumJson }).from(curricula)
    .where(and(eq(curricula.id, id), eq(curricula.version, version), isNull(curricula.deletedAt))).get();
  return row ? parseJson<Curriculum | undefined>(row.json, undefined) : undefined;
}

/** Latest non-deleted version of each curriculum id. */
export async function listCurricula(db: Db): Promise<CurriculumManifest[]> {
  const rows = await db.select({ id: curricula.id, version: curricula.version, manifestJson: curricula.manifestJson })
    .from(curricula).where(isNull(curricula.deletedAt)).orderBy(asc(curricula.id), asc(curricula.version)).all();
  const latest = new Map<string, CurriculumManifest>();
  for (const r of rows) latest.set(r.id, parseJson<CurriculumManifest>(r.manifestJson, { id: r.id, version: r.version } as CurriculumManifest));
  return [...latest.values()];
}

export async function listCurriculumVersions(db: Db, id: string): Promise<CurriculumManifest[]> {
  const rows = await db.select({ manifestJson: curricula.manifestJson }).from(curricula)
    .where(and(eq(curricula.id, id), isNull(curricula.deletedAt))).orderBy(asc(curricula.version)).all();
  return rows.map((r) => parseJson<CurriculumManifest>(r.manifestJson, {} as CurriculumManifest));
}

export async function deleteCurriculum(db: Db, id: string, version: number, now: number = Date.now()): Promise<void> {
  await db.update(curricula).set({ deletedAt: now, updatedAt: now })
    .where(and(eq(curricula.id, id), eq(curricula.version, version))).run();
}

export async function freezeCurriculum(db: Db, id: string, version: number, now: number = Date.now()): Promise<void> {
  await db.update(curricula).set({ frozenAt: now, updatedAt: now })
    .where(and(eq(curricula.id, id), eq(curricula.version, version))).run();
}

function rowToItem(r: ItemRow): Item {
  return parseJson<Item>(r.json, {} as Item);
}

function rowToConcept(r: ConceptRow, conceptItems: Item[]): Concept & { unitId: string; lessonId: string; curriculumId: string; curriculumVersion: number } {
  const shell = parseJson<ConceptShell>(r.json, {} as ConceptShell);
  return { ...shell, id: r.id, ordinal: r.ordinal, name: r.name, items: conceptItems,
    unitId: r.unitId, lessonId: r.lessonId, curriculumId: r.curriculumId, curriculumVersion: r.curriculumVersion };
}

export async function getConcept(db: Db, id: string) {
  const row = await db.select().from(concepts).where(eq(concepts.id, id)).get();
  if (!row) return undefined;
  return rowToConcept(row, await getItemsForConcept(db, id));
}

export async function getConcepts(db: Db, curriculumId: string, version: number) {
  const rows = await db.select().from(concepts)
    .where(and(eq(concepts.curriculumId, curriculumId), eq(concepts.curriculumVersion, version)))
    .orderBy(asc(concepts.ordinal)).all();
  const itemRows = await db.select().from(items)
    .where(and(eq(items.curriculumId, curriculumId), eq(items.curriculumVersion, version))).all();
  const byConcept = new Map<string, Item[]>();
  for (const ir of itemRows) {
    const list = byConcept.get(ir.conceptId) ?? [];
    list.push(rowToItem(ir));
    byConcept.set(ir.conceptId, list);
  }
  return rows.map((r) => rowToConcept(r, byConcept.get(r.id) ?? []));
}

export async function getItem(db: Db, id: string): Promise<Item | undefined> {
  const row = await db.select().from(items).where(eq(items.id, id)).get();
  return row ? rowToItem(row) : undefined;
}

export async function getItemsForConcept(db: Db, conceptId: string): Promise<Item[]> {
  const rows = await db.select().from(items).where(eq(items.conceptId, conceptId)).all();
  return rows.map(rowToItem);
}

function rowToEdge(r: EdgeRow): ConceptEdge {
  const e: ConceptEdge = { from: r.fromId, to: r.toId, kind: r.kind as ConceptEdge['kind'] };
  if (r.weight !== null) e.weight = r.weight;
  if (r.justification !== null) e.justification = r.justification;
  if (r.confidence !== null) e.confidence = r.confidence;
  return e;
}

export async function getEdges(db: Db, curriculumId: string, version: number): Promise<ConceptEdge[]> {
  const rows = await db.select().from(conceptEdges)
    .where(and(eq(conceptEdges.curriculumId, curriculumId), eq(conceptEdges.curriculumVersion, version))).all();
  return rows.map(rowToEdge);
}
