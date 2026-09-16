import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { Curriculum, CurriculumManifest } from '@epistemics/core';
import { Banner, Button, Card, EmptyState, Pill, Spinner, Tabs } from '@epistemics/ui';
import { useApp, useQuery } from '../../lib/app-state.js';
import { dateShort } from '../../lib/format.js';
import { countConcepts, exportPack, importPacks, installPack, listBundledPacks, listShelf } from '../../lib/services/packs.js';

type Tab = 'bundled' | 'mine' | 'library';

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
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shelf</h1>
        <Button variant="secondary" onClick={doImport} disabled={busy === 'import'} data-testid="import-pack">Import .epistemics.json</Button>
      </header>
      {noCourse ? <Banner tone="info">Enrol in a course to get started: pick a bundled pack or import one.</Banner> : null}
      {message ? <Banner tone={message.tone} data-testid="shelf-message">{message.text}</Banner> : null}
      <Tabs tabs={[{ id: 'bundled', label: 'Bundled' }, { id: 'library', label: 'Imported & bundled library' }, { id: 'mine', label: `My courses (${app.courses.length})` }]} value={tab} onChange={setTab} />

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
              <ManifestCard key={`${m.id}@${m.version}`} manifest={m} onEnrol={() => navigate(`/setup?curriculum=${encodeURIComponent(m.id)}&version=${m.version}`)} onExport={() => exportPack(app.db, app.platform, m.id, m.version)} />
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
