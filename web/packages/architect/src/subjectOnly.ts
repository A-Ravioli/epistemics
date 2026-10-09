/**
 * Subject-only builds (no sources): the outline stage is asked for a canonical
 * outline for the stated scope and level plus the textbook-style references it
 * assumes; those references are surfaced in the manifest description.
 */
import type { OutlineOutput } from './schemas.js';

export interface OutlineRequestInputs {
  subject: string;
  level: string;
  goals: string;
  mode: 'subject-only' | 'sources';
  instructions: string;
  sources?: unknown;
}

export const SUBJECT_ONLY_INSTRUCTIONS =
  'No source documents are supplied. Produce a canonical outline for the stated subject, scope and level, following the ' +
  'treatment of standard textbooks for that level, and list those textbook-style references in `assumedReferences` ' +
  '(2-5 entries, "Title, Author"). Leave every `chunkIds` array empty.';

export const WITH_SOURCES_INSTRUCTIONS =
  'Source documents are supplied below as a manifest of chunks. The document structure is the prior: follow its chapter ' +
  'order, splitting or merging where a lesson would otherwise be too long or too short, and list the covered `chunkIds` ' +
  'for every lesson. Leave `assumedReferences` empty.';

export function subjectOnlyOutlineInputs(subject: string, level: string, goals: string | undefined): OutlineRequestInputs {
  return { subject, level, goals: goals ?? '', mode: 'subject-only', instructions: SUBJECT_ONLY_INSTRUCTIONS };
}

/** Manifest description for an outline: its description plus the assumed references when there are any. */
export function describeOutline(outline: Pick<OutlineOutput, 'description' | 'assumedReferences'>): string {
  const refs = outline.assumedReferences.map((r) => r.trim()).filter(Boolean);
  const base = outline.description.trim();
  if (!refs.length) return base;
  const list = refs.map((r) => `- ${r}`).join('\n');
  return `${base}${base ? '\n\n' : ''}Assumed references (no sources were supplied; content follows these standard treatments):\n${list}`;
}

/** Recover the assumed reference list from a manifest description written by `describeOutline`. */
export function assumedReferencesFromDescription(description: string): string[] {
  const idx = description.indexOf('Assumed references');
  if (idx < 0) return [];
  return description
    .slice(idx)
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}
