/**
 * Bundled packs (content/packs/*.epistemics.json, bundled by Vite through import.meta.glob so the same
 * build works in the browser and inside the Tauri static bundle) plus import/export via platform.files.
 */
import { CurriculumSchema, type Curriculum, type CurriculumManifest } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import { getCurriculum, listCurricula, saveCurriculum } from '@epistemics/db';
import type { Platform } from '@epistemics/platform';

const bundled = import.meta.glob<Curriculum>('../../../../../content/packs/*.epistemics.json', { import: 'default' });

export interface BundledPack {
  file: string;
  load: () => Promise<Curriculum>;
}

export function listBundledPacks(): BundledPack[] {
  return Object.entries(bundled)
    .map(([path, load]) => ({ file: path.split('/').pop() ?? path, load: async () => parsePack(await load()) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export class PackValidationError extends Error {
  override readonly name = 'PackValidationError';
}

/** Validate a JSON value as a Curriculum. Throws PackValidationError with a readable message. */
export function parsePack(value: unknown): Curriculum {
  const r = CurriculumSchema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new PackValidationError(`Not a valid .epistemics.json pack: ${issues}`);
  }
  return r.data as Curriculum;
}

export function parsePackText(text: string): Curriculum {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PackValidationError('The file is not valid JSON.');
  }
  return parsePack(json);
}

/** Save a curriculum into the local shelf (idempotent per id+version). */
export async function installPack(db: Db, pack: Curriculum): Promise<CurriculumManifest> {
  await saveCurriculum(db, pack);
  return pack.manifest;
}

export async function importPacks(db: Db, platform: Platform): Promise<{ installed: CurriculumManifest[]; errors: string[] }> {
  const files = await platform.files.pick(['.json', 'application/json']);
  const installed: CurriculumManifest[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      const pack = parsePackText(new TextDecoder().decode(f.bytes));
      installed.push(await installPack(db, pack));
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { installed, errors };
}

export async function exportPack(db: Db, platform: Platform, id: string, version: number): Promise<void> {
  const c = await getCurriculum(db, id, version);
  if (!c) throw new Error('Curriculum not found');
  const slug = c.manifest.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || c.manifest.id;
  await platform.files.saveText(`${slug}.epistemics.json`, JSON.stringify(c, null, 2));
}

export async function listShelf(db: Db): Promise<CurriculumManifest[]> {
  return listCurricula(db);
}

export function countConcepts(c: Curriculum): { units: number; lessons: number; concepts: number; items: number } {
  let lessons = 0;
  let concepts = 0;
  let items = 0;
  for (const u of c.units) {
    lessons += u.lessons.length;
    for (const l of u.lessons) {
      concepts += l.concepts.length;
      for (const k of l.concepts) items += k.items.length;
    }
  }
  return { units: c.units.length, lessons, concepts, items };
}
