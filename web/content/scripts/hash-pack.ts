/**
 * Fills the content hashes of a pack in place:
 *   - every item.hash          = sha256(canonicalJson({ prompt, reference, rubric }))
 *   - manifest.contentHash     = sha256(canonicalJson({ units, edges }))   (computed after item hashes)
 *
 * Usage:
 *   node --experimental-strip-types content/scripts/hash-pack.ts [content/packs/probability-basics.epistemics.json ...]
 *
 * With no arguments, every content/packs/*.epistemics.json is rehashed. Idempotent: running it twice
 * leaves the file unchanged. Exits 1 if any hash changed and --check is passed.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// @epistemics/core is authored with `.js` specifiers that point at `.ts` sources (bundler-style
// resolution). Node's type stripping does not remap them, so register a tiny resolve hook that
// retries a missing `x.js` as `x.ts` before importing the package.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (err) {
          if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.endsWith('.js')) {
            return next(specifier.slice(0, -3) + '.ts', context);
          }
          throw err;
        }
      }`),
  import.meta.url,
);

const { canonicalJson, sha256 } = (await import('@epistemics/core')) as typeof import('@epistemics/core');
type Curriculum = import('@epistemics/core').Curriculum;

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = resolve(here, '../packs');
const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));
const targets = files.length > 0 ? files.map((f) => resolve(process.cwd(), f)) : readdirSync(packsDir).filter((f) => f.endsWith('.epistemics.json')).map((f) => resolve(packsDir, f));

let changed = 0;
for (const file of targets) {
  const original = readFileSync(file, 'utf8');
  const pack = JSON.parse(original) as Curriculum;
  let itemChanges = 0;
  for (const unit of pack.units) {
    for (const lesson of unit.lessons) {
      for (const concept of lesson.concepts) {
        for (const item of concept.items) {
          const h = await sha256(canonicalJson({ prompt: item.prompt, reference: item.reference, rubric: item.rubric }));
          if (item.hash !== h) { item.hash = h; itemChanges++; }
        }
      }
    }
  }
  const contentHash = await sha256(canonicalJson({ units: pack.units, edges: pack.edges }));
  const manifestChanged = pack.manifest.contentHash !== contentHash;
  pack.manifest.contentHash = contentHash;
  const output = JSON.stringify(pack, null, 2) + '\n';
  if (output !== original) {
    changed++;
    if (!check) writeFileSync(file, output);
  }
  console.log(`${file}: ${itemChanges} item hash(es) ${check ? 'stale' : 'updated'}, contentHash ${manifestChanged ? (check ? 'stale' : 'updated') : 'unchanged'} (${contentHash.slice(0, 12)}…)`);
}
if (check && changed > 0) {
  console.error(`${changed} pack(s) have stale hashes; run hash-pack.ts without --check.`);
  process.exit(1);
}
