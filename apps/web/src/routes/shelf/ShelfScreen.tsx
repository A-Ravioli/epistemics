import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { getCurriculum } from '@epistemics/db';
import type { Curriculum, CurriculumManifest } from '@epistemics/core';
import { Banner, Button, Card, EmptyState, Pill, Spinner, Tabs } from '@epistemics/ui';
import { useApp, useQuery } from '../../lib/app-state.js';
import { dateShort } from '../../lib/format.js';
import { CurriculumBuilder, builtUnitCount, curriculumKey, isFullyBuilt, unitBuilds, unitStatus } from '../../lib/services/build.js';
import { countConcepts, exportPack, importPacks, installPack, listBundledPacks, listShelf } from '../../lib/services/packs.js';
import { getBuiltCurricula } from '../../lib/settings.js';
import { useStore } from '../../lib/store.js';

type Tab = 'bundled' | 'built' | 'mine' | 'library';

export function ShelfScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const noCourse = (location.state as { reason?: string } | null)?.reason === 'no-course';
  const [tab, setTab] = useState<Tab>(app.courses.length ? 'mine' : 'bundled');
  const [busy, setBusy] = useState<string | undefined>();
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | undefined>();
  const bundledQ = useQuery(async () => {
    const packs = listBundledPacks();
    const loaded: { file: string; pack: Curriculum }[] = [];
    for (const p of packs) {
      try {
        loaded.push({ file: p.file, pack: await p.load() });
      } catch (e) {
        console.warn('bundled pack failed to load', p.file, e);
      }
    }
    return loaded;
  }, []);
  const libraryQ = useQuery(() => listShelf(app.db), [busy]);
  const builds = useStore(unitBuilds);
  const builtQ = useQuery(async () => {
    const refs = await getBuiltCurricula(app.db);
    const out: Curriculum[] = [];
    for (const r of [...refs].reverse()) {
      const c = await getCurriculum(app.db, r.id, r.version);
      if (c) out.push(c);
    }
    return out;
  }, [busy, builds]);
  const builder = useMemo(() => new CurriculumBuilder(app.db, app.llm.provider), [app.db, app.llm.provider]);

  const enrol = async (pack: Curriculum) => {
    setBusy(pack.manifest.id);
    try {
      await installPack(app.db, pack);
      navigate(`/setup?curriculum=${encodeURIComponent(pack.manifest.id)}&version=${pack.manifest.version}`);
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const doExport = async (id: string, version: number) => {
    setMessage(undefined);
    try {
      await exportPack(app.db, app.platform, id, version);
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const buildNext = async (c: Curriculum) => {
    const next = unitStatus(c).find((s) => !s.built);
    if (!next) return;
    setMessage(undefined);
    setBusy(`build:${c.manifest.id}`);
    try {
      await builder.buildUnitOf(c.manifest.id, c.manifest.version, next.unit.ordinal);
      setMessage({ tone: 'good', text: `Built "${next.unit.title}" of ${c.manifest.title}.` });
      if (app.active?.course.curriculumId === c.manifest.id) await app.refreshCourses();
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const doImport = async () => {
    setBusy('import');
    setMessage(undefined);
    try {
      const r = await importPacks(app.db, app.platform);
      if (r.installed.length) {
        setMessage({ tone: 'good', text: `Imported ${r.installed.map((m) => `${m.title} v${m.version}`).join(', ')}.` });
        setTab('library');
      }
      if (r.errors.length) setMessage({ tone: 'bad', text: r.errors.join(' ') });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Shelf</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={doImport} disabled={busy === 'import'} data-testid="import-pack">Import .epistemics.json</Button>
          <Button onClick={() => navigate('/setup')} data-testid="build-course-entry">Build a course</Button>
        </div>
      </header>
      {noCourse ? <Banner tone="info">Enrol in a course to get started: pick a bundled pack, import one, or build a course from a subject or your own material.</Banner> : null}
      {message ? <Banner tone={message.tone} data-testid="shelf-message">{message.text}</Banner> : null}
      <Tabs tabs={[{ id: 'bundled', label: 'Bundled' }, { id: 'built', label: `Built by you (${builtQ.data?.length ?? 0})` }, { id: 'library', label: 'Imported & bundled library' }, { id: 'mine', label: `My courses (${app.courses.length})` }]} value={tab} onChange={setTab} />

      {tab === 'built' ? (
        builtQ.loading && !builtQ.data ? <Spinner /> : !builtQ.data?.length ? (
          <EmptyState title="Nothing built yet" body="Build a course from a subject name or from your own PDFs, EPUBs, DOCX or Markdown. Generation is cached, so re-running a build never regenerates what exists." action={<Button onClick={() => navigate('/setup')}>Build a course</Button>} />
        ) : (
          <div className="space-y-3" data-testid="built-list">
            {builtQ.data.map((c) => (
              <BuiltCard
                key={curriculumKey(c.manifest.id, c.manifest.version)}
                curriculum={c}
                building={builds[curriculumKey(c.manifest.id, c.manifest.version)] !== undefined || busy === `build:${c.manifest.id}`}
                onEnrol={() => navigate(`/setup?curriculum=${encodeURIComponent(c.manifest.id)}&version=${c.manifest.version}`)}
                onExport={() => doExport(c.manifest.id, c.manifest.version)}
                onBuildNext={() => buildNext(c)}
              />
            ))}
          </div>
        )
      ) : null}

      {tab === 'bundled' ? (
        bundledQ.loading ? <Spinner /> : !bundledQ.data?.length ? (
          <EmptyState title="No bundled packs in this build" body="Import a .epistemics.json pack to get started." action={<Button onClick={doImport}>Import a pack</Button>} />
        ) : (
          <div className="space-y-3">
            {bundledQ.data.map(({ file, pack }) => (
              <PackCard key={file} pack={pack} onEnrol={() => enrol(pack)} busy={busy === pack.manifest.id} />
            ))}
          </div>
        )
      ) : null}

      {tab === 'library' ? (
        libraryQ.loading ? <Spinner /> : !libraryQ.data?.length ? (
          <EmptyState title="Nothing on the shelf yet" body="Bundled packs land here once you enrol; imported packs land here immediately." />
        ) : (
          <div className="space-y-3">
            {libraryQ.data.map((m) => (
              <ManifestCard key={`${m.id}@${m.version}`} manifest={m} onEnrol={() => navigate(`/setup?curriculum=${encodeURIComponent(m.id)}&version=${m.version}`)} onExport={() => doExport(m.id, m.version)} />
            ))}
          </div>
        )
      ) : null}

      {tab === 'mine' ? (
        app.courses.length === 0 ? (
          <EmptyState title="No courses yet" body="Enrol from a bundled or imported pack." action={<Button onClick={() => setTab('bundled')}>Browse packs</Button>} />
        ) : (
          <div className="space-y-3" data-testid="my-courses">
            {app.courses.map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">{c.title}{app.active?.course.id === c.id ? <Pill tone="accent">active</Pill> : null}</div>
                  <div className="text-xs text-ink/60">{c.goals.purpose}{c.goals.examDate ? ` · exam ${dateShort(c.goals.examDate)}` : ''} · {c.goals.weeklyMinutes} min/week · since {dateShort(c.createdAt)}</div>
                </div>
                <div className="flex gap-2">
                  {app.active?.course.id !== c.id ? <Button variant="secondary" onClick={() => app.setActiveCourse(c.id)}>Make active</Button> : <Link to="/today"><Button>Open</Button></Link>}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function PackCard({ pack, onEnrol, busy }: { pack: Curriculum; onEnrol: () => void; busy: boolean }) {
  const m = pack.manifest;
  const n = countConcepts(pack);
  return (
    <Card className="flex items-start justify-between gap-4" data-testid="pack-card">
      <div>
        <div className="text-base font-medium">{m.title}</div>
        <div className="text-xs text-ink/60">{m.subject} · {m.level} · v{m.version}{m.licence ? ` · ${m.licence}` : ''}</div>
        <p className="mt-1 text-sm text-ink/80">{m.description}</p>
        <div className="mt-1 text-xs text-ink/60">{n.units} units · {n.lessons} lessons · {n.concepts} concepts · {n.items} items</div>
      </div>
      <Button onClick={onEnrol} disabled={busy} data-testid="enrol">Enrol</Button>
    </Card>
  );
}

function BuiltCard({ curriculum: c, building, onEnrol, onExport, onBuildNext }: { curriculum: Curriculum; building: boolean; onEnrol: () => void; onExport: () => Promise<void>; onBuildNext: () => Promise<void> }) {
  const m = c.manifest;
  const n = countConcepts(c);
  const built = builtUnitCount(c);
  const full = isFullyBuilt(c);
  const gen = `${m.generator.name} ${m.generator.version}${m.generator.promptVersion ? ` · prompts v${m.generator.promptVersion}` : ''}${m.generator.model ? ` · ${m.generator.model}` : ''}`;
  return (
    <Card className="flex items-start justify-between gap-4" data-testid="built-card">
      <div>
        <div className="flex items-center gap-2 text-base font-medium">{m.title}{full ? <Pill tone="good">fully built</Pill> : <Pill tone="warn">{built}/{c.units.length} units built</Pill>}</div>
        <div className="text-xs text-ink/60">{m.subject} · {m.level} · v{m.version} · {gen} · {dateShort(m.createdAt)}</div>
        <div className="mt-1 text-xs text-ink/60">{n.units} units · {n.lessons} lessons · {n.concepts} concepts · {n.items} items{c.sources.length ? ` · ${c.sources.length} source${c.sources.length === 1 ? '' : 's'}` : ' · subject only'}</div>
        {building ? <div className="mt-1 text-xs text-accent" data-testid="built-building">Building the next unit…</div> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {!full ? <Button variant="secondary" onClick={() => void onBuildNext()} disabled={building}>Build next unit</Button> : null}
        <Button variant="secondary" onClick={() => void onExport()} disabled={!full} title={full ? 'Export as .epistemics.json' : 'Build all units before exporting'} data-testid="export-built">Export</Button>
        <Button onClick={onEnrol} data-testid="enrol">Enrol</Button>
      </div>
    </Card>
  );
}

function ManifestCard({ manifest: m, onEnrol, onExport }: { manifest: CurriculumManifest; onEnrol: () => void; onExport: () => Promise<void> }) {
  return (
    <Card className="flex items-start justify-between gap-4" data-testid="library-card">
      <div>
        <div className="text-base font-medium">{m.title}</div>
        <div className="text-xs text-ink/60">{m.subject} · {m.level} · v{m.version} · {m.generator.name}</div>
        <p className="mt-1 text-sm text-ink/80">{m.description}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => void onExport()}>Export</Button>
        <Button onClick={onEnrol} data-testid="enrol">Enrol</Button>
      </div>
    </Card>
  );
}
