import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getCurriculum } from '@epistemics/db';
import type { Curriculum, CurriculumManifest } from '@epistemics/core';
import { Banner, Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Skeleton, Tabs } from '@epistemics/ui';
import { useApp, useQuery } from '../../lib/app-state.js';
import { dateShort } from '../../lib/format.js';
import { CurriculumBuilder, builtUnitCount, curriculumKey, isFullyBuilt, unitBuilds, unitStatus } from '../../lib/services/build.js';
import { countConcepts, exportPack, importPacks, installPack, listBundledPacks, listShelf } from '../../lib/services/packs.js';
import { getBuiltCurricula } from '../../lib/settings.js';
import { useStore } from '../../lib/store.js';

type Tab = 'bundled' | 'built' | 'mine' | 'library';

/** Rough study time: ~25 minutes per lesson (dialogue + check) and ~20 seconds per review card on first pass. */
function estimate(n: { lessons: number; items: number }): string {
  const lessonMin = n.lessons * 25;
  const hours = lessonMin / 60;
  const lessons = hours >= 1 ? `~${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} h of lessons` : `~${lessonMin} min of lessons`;
  return `${lessons} · ${n.items} review questions`;
}

function Counts({ pack }: { pack: Curriculum }) {
  const n = countConcepts(pack);
  return (
    <div className="mt-1 text-xs text-muted">
      {n.units} unit{n.units === 1 ? '' : 's'} · {n.lessons} lesson{n.lessons === 1 ? '' : 's'} · {n.concepts} concept{n.concepts === 1 ? '' : 's'} · {estimate(n)}
    </div>
  );
}

export function ShelfScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const noCourse = app.courses.length === 0;
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
    setMessage(undefined);
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
      setMessage({ tone: 'good', text: 'Pack exported as .epistemics.json.' });
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
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const loading = (label: string) => <Card><Skeleton lines={3} label={label} /></Card>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Shelf"
        description="Courses are built from packs: a versioned curriculum of units, lessons, concepts and review questions."
        actions={
          <>
            <Button variant="secondary" onClick={doImport} disabled={busy === 'import'} data-testid="import-pack" title="Load a .epistemics.json pack someone exported">Import a pack</Button>
            <Button onClick={() => navigate('/setup')} data-testid="build-course-entry" title="Generate a new pack from a subject or your own files">Build a course</Button>
          </>
        }
      />
      {noCourse ? <Banner tone="info" data-testid="shelf-no-course">No course yet. <strong>Enrol</strong> in a pack below to start one; <strong>Build</strong> generates a new pack from a subject or your own files; <strong>Import</strong> loads a pack someone exported.</Banner> : null}
      {message ? <Banner tone={message.tone} data-testid="shelf-message">{message.text}</Banner> : null}
      <Tabs tabs={[{ id: 'bundled', label: 'Bundled' }, { id: 'built', label: `Built by you (${builtQ.data?.length ?? 0})` }, { id: 'library', label: 'Library' }, { id: 'mine', label: `My courses (${app.courses.length})` }]} value={tab} onChange={setTab} />

      {tab === 'built' ? (
        builtQ.error ? <ErrorBanner message={builtQ.error} onRetry={builtQ.refresh} /> : builtQ.loading && !builtQ.data ? loading('Loading your builds') : !builtQ.data?.length ? (
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
        bundledQ.error ? <ErrorBanner message={bundledQ.error} onRetry={bundledQ.refresh} /> : bundledQ.loading ? loading('Loading bundled packs') : !bundledQ.data?.length ? (
          <EmptyState title="No bundled packs in this build" body="Import a .epistemics.json pack to get started." action={<Button onClick={doImport}>Import a pack</Button>} />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">Hand-authored packs that ship with the app. Enrolling copies one into your library and creates a course from it.</p>
            {bundledQ.data.map(({ file, pack }) => (
              <PackCard key={file} pack={pack} onEnrol={() => enrol(pack)} busy={busy === pack.manifest.id} />
            ))}
          </div>
        )
      ) : null}

      {tab === 'library' ? (
        libraryQ.error ? <ErrorBanner message={libraryQ.error} onRetry={libraryQ.refresh} /> : libraryQ.loading ? loading('Loading the library') : !libraryQ.data?.length ? (
          <EmptyState title="Nothing in the library yet" body="Bundled packs land here once you enrol; imported packs land here immediately." action={<Button variant="secondary" onClick={doImport}>Import a pack</Button>} />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">Every pack on this device: imported, bundled-and-enrolled, or built. You can enrol again (a second course on the same pack) or export.</p>
            {libraryQ.data.map((m) => (
              <ManifestCard key={`${m.id}@${m.version}`} manifest={m} onEnrol={() => navigate(`/setup?curriculum=${encodeURIComponent(m.id)}&version=${m.version}`)} onExport={() => doExport(m.id, m.version)} />
            ))}
          </div>
        )
      ) : null}

      {tab === 'mine' ? (
        app.courses.length === 0 ? (
          <EmptyState title="No courses yet" body="Enrol from a bundled or imported pack, or build one." action={<Button onClick={() => setTab('bundled')}>Browse packs</Button>} />
        ) : (
          <div className="space-y-3" data-testid="my-courses">
            <p className="text-xs text-muted">Today, the map and progress all show the active course. Switch with “Make active”.</p>
            {app.courses.map((c) => (
              <Card key={c.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{c.title}{app.active?.course.id === c.id ? <Pill tone="accent">active</Pill> : null}</div>
                  <div className="text-xs text-muted">{c.goals.purpose}{c.goals.examDate ? ` · exam ${dateShort(c.goals.examDate)}` : ''} · {c.goals.weeklyMinutes} min/week · since {dateShort(c.createdAt)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {app.active?.course.id !== c.id ? <Button variant="secondary" onClick={() => app.setActiveCourse(c.id)}>Make active</Button> : <Link to="/today"><Button>Open Today</Button></Link>}
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
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-testid="pack-card">
      <div className="min-w-0">
        <div className="text-base font-medium">{m.title}</div>
        <div className="text-xs text-muted">{m.subject} · {m.level} · v{m.version}{m.licence ? ` · ${m.licence}` : ''}</div>
        <p className="mt-1 text-sm text-ink/80">{m.description}</p>
        <Counts pack={pack} />
      </div>
      <Button onClick={onEnrol} disabled={busy} data-testid="enrol" className="shrink-0" title="Create a course from this pack">{busy ? 'Enrolling…' : 'Enrol'}</Button>
    </Card>
  );
}

function BuiltCard({ curriculum: c, building, onEnrol, onExport, onBuildNext }: { curriculum: Curriculum; building: boolean; onEnrol: () => void; onExport: () => Promise<void>; onBuildNext: () => Promise<void> }) {
  const m = c.manifest;
  const built = builtUnitCount(c);
  const full = isFullyBuilt(c);
  const gen = `${m.generator.name} ${m.generator.version}${m.generator.promptVersion ? ` · prompts v${m.generator.promptVersion}` : ''}${m.generator.model ? ` · ${m.generator.model}` : ''}`;
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-testid="built-card">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-base font-medium">{m.title}{full ? <Pill tone="good">fully built</Pill> : <Pill tone="warn" title="Later units are generated as you approach them">{built}/{c.units.length} units built</Pill>}</div>
        <div className="text-xs text-muted">{m.subject} · {m.level} · v{m.version} · {gen} · {dateShort(m.createdAt)}</div>
        <Counts pack={c} />
        <div className="text-xs text-muted">{c.sources.length ? `grounded in ${c.sources.length} source${c.sources.length === 1 ? '' : 's'} you uploaded` : 'from the subject name only'}</div>
        {building ? <div className="mt-1 text-xs text-accent" data-testid="built-building" role="status">Building the next unit…</div> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
        {!full ? <Button variant="secondary" size="sm" onClick={() => void onBuildNext()} disabled={building}>Build next unit</Button> : null}
        <Button variant="secondary" size="sm" onClick={() => void onExport()} disabled={!full} title={full ? 'Save as .epistemics.json to share or back up' : 'Build all units before exporting'} data-testid="export-built">Export</Button>
        <Button size="sm" onClick={onEnrol} data-testid="enrol" title="Create a course from this pack">Enrol</Button>
      </div>
    </Card>
  );
}

function ManifestCard({ manifest: m, onEnrol, onExport }: { manifest: CurriculumManifest; onEnrol: () => void; onExport: () => Promise<void> }) {
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-testid="library-card">
      <div className="min-w-0">
        <div className="text-base font-medium">{m.title}</div>
        <div className="text-xs text-muted">{m.subject} · {m.level} · v{m.version} · {m.generator.name}</div>
        <p className="mt-1 text-sm text-ink/80">{m.description}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" onClick={() => void onExport()} title="Save as .epistemics.json">Export</Button>
        <Button size="sm" onClick={onEnrol} data-testid="enrol" title="Create a course from this pack">Enrol</Button>
      </div>
    </Card>
  );
}
