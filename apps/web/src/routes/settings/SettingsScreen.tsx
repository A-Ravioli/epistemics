import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { LlmRole } from '@epistemics/core';
import { DEFAULT_MODELS } from '@epistemics/llm';
import { Banner, Button, Card, ChoiceGroup, Divider, ErrorBanner, Field, Page, PageHeader, SectionTitle, SegmentedGroup, Spinner, inputClass } from '@epistemics/ui';
import { useApp } from '../../lib/app-state.js';
import { API_KEY_SECRET } from '../../lib/llm.js';
import { getLlmSettings, setLlmSettings, type LlmSettings } from '../../lib/settings.js';
import { patchCourseSettings } from '../../lib/services/courses.js';

const ROLES: LlmRole[] = ['tutor', 'observer', 'grader', 'student', 'leakcheck'];
const ROLE_HELP: Partial<Record<LlmRole, string>> = {
  tutor: 'asks the questions and gives hints',
  observer: 'watches each turn and tells the lesson when to move on',
  grader: 'grades answers blind against rubrics',
  student: 'plays the confused student in teach-back',
  leakcheck: 'checks that the tutor never leaks an answer',
};

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4" data-testid={`settings-${id}`}>
      <div>
        <SectionTitle>{title}</SectionTitle>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      <Divider />
      {children}
    </Card>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const [llm, setLlm] = useState<LlmSettings>(app.llmSettings);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const t = localStorage.getItem('epistemics:theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  });
  const course = app.active?.course;
  const [retention, setRetention] = useState(course?.settings.desiredRetention ?? 0.9);
  const [reviewsPerDay, setReviewsPerDay] = useState(course?.settings.reviewsPerDay ?? 120);
  const [maxNew, setMaxNew] = useState(course?.settings.maxNewItemsPerDay ?? 40);

  useEffect(() => {
    getLlmSettings(app.db).then(setLlm).catch(() => undefined);
    app.platform.secrets.get(API_KEY_SECRET).then((k) => setHasKey(!!k)).catch(() => undefined);
  }, [app.db, app.platform]);

  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(undefined), 2500);
  };

  const saveLlm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (apiKey.trim()) {
        await app.platform.secrets.set(API_KEY_SECRET, apiKey.trim());
        setApiKey('');
        setHasKey(true);
      }
      await setLlmSettings(app.db, llm);
      const web = app.platform as { setLlmMode?: (m: 'proxy' | 'byok') => Promise<void> };
      if (web.setLlmMode && (llm.transport === 'byok' || llm.transport === 'proxy')) await web.setLlmMode(llm.transport);
      await app.reloadLlm();
      flash('Tutor settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgetKey = async () => {
    setError(undefined);
    try {
      await app.platform.secrets.delete(API_KEY_SECRET);
      setHasKey(false);
      await app.reloadLlm();
      flash('API key removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveCourse = async () => {
    if (!course) return;
    setBusy(true);
    setError(undefined);
    try {
      await patchCourseSettings(app.db, course.id, { desiredRetention: retention, reviewsPerDay, maxNewItemsPerDay: maxNew });
      await app.refreshCourses();
      flash('Scheduling settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyTheme = (t: typeof theme) => {
    setTheme(t);
    try {
      if (t === 'system') {
        localStorage.removeItem('epistemics:theme');
        delete document.documentElement.dataset['theme'];
      } else {
        localStorage.setItem('epistemics:theme', t);
        document.documentElement.dataset['theme'] = t;
      }
    } catch {
      /* ignore */
    }
  };

  const exportDb = async () => {
    setError(undefined);
    try {
      const p = app.platform as { exportDatabase?: () => Promise<Uint8Array> };
      if (!p.exportDatabase) return;
      const bytes = await p.exportDatabase();
      const blob = new Blob([bytes as BlobPart], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epistemics-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash('Backup downloaded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const importDb = async () => {
    setError(undefined);
    try {
      const p = app.platform as { importDatabase?: (b: Uint8Array) => Promise<void> };
      if (!p.importDatabase) return;
      const files = await app.platform.files.pick(['.sqlite', '.db', 'application/x-sqlite3']);
      const f = files[0];
      if (!f) return;
      if (!window.confirm('Replace the current database with this backup? Everything not in the backup is lost. This cannot be undone.')) return;
      await p.importDatabase(f.bytes);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const canBackup = 'exportDatabase' in app.platform;

  const anthropicSettings = (
    <>
      {app.platform.kind === 'web' ? (
        <ChoiceGroup<LlmSettings['transport']>
          label="How the key is used"
          value={llm.transport}
          onChange={(transport) => setLlm({ ...llm, transport })}
          options={[
            {
              value: 'byok',
              label: 'Bring your own key',
              description: 'Stored in this browser and sent straight to the API.',
              detail: (
                <Field label={hasKey ? 'API key (one is stored; enter a new one to replace it)' : 'API key'}>
                  <div className="flex gap-2">
                    <input type="password" className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" data-testid="api-key" />
                    {hasKey ? <Button variant="secondary" onClick={forgetKey}>Forget</Button> : null}
                  </div>
                </Field>
              ),
            },
            { value: 'proxy', label: 'Server proxy', description: 'The key stays on your server; the app calls /api/anthropic with a daily budget.' },
          ]}
        />
      ) : (
        <>
          <p className="text-[13px] text-muted">On desktop the key lives in the OS keychain and never enters the app.</p>
          <Field label={hasKey ? 'API key (one is stored; enter a new one to replace it)' : 'API key'}>
            <div className="flex gap-2">
              <input type="password" className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" data-testid="api-key" />
              {hasKey ? <Button variant="secondary" onClick={forgetKey}>Forget</Button> : null}
            </div>
          </Field>
        </>
      )}
      <details className="rounded-input bg-nested px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted">Model per role (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <Field key={role} label={`${role[0]!.toUpperCase()}${role.slice(1)}`} hint={ROLE_HELP[role]}>
              <input className={inputClass} value={llm.models[role] ?? ''} placeholder={DEFAULT_MODELS[role]} onChange={(e) => setLlm({ ...llm, models: { ...llm.models, [role]: e.target.value || undefined } })} />
            </Field>
          ))}
        </div>
      </details>
      <Field label="Daily budget in USD per course (0 = no limit)" hint="At 80% of the budget the tutor switches to a cheaper model; at 100% it stops for the day.">
        <input type="number" min={0} step={0.5} className={inputClass} value={llm.dailyBudgetUsd} onChange={(e) => setLlm({ ...llm, dailyBudgetUsd: Number(e.target.value) })} />
      </Field>
    </>
  );

  const ollamaSettings = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Ollama base URL"><input className={inputClass} value={llm.ollamaBaseUrl} onChange={(e) => setLlm({ ...llm, ollamaBaseUrl: e.target.value })} /></Field>
      <Field label="Model" hint="Local models teach less well than Claude; expect rougher hints and grading."><input className={inputClass} value={llm.ollamaModel} onChange={(e) => setLlm({ ...llm, ollamaModel: e.target.value })} /></Field>
    </div>
  );

  return (
    <Page width="sm">
      <PageHeader title="Settings" crumbs={[{ label: 'Settings' }]} description="Three groups: the tutor (which model talks to you), scheduling (how much review each day), and your data." />
      {saved ? <Banner tone="good" data-testid="settings-saved">{saved}</Banner> : null}
      {error ? <ErrorBanner message={error} /> : null}

      <Section id="tutor" title="Tutor" description="Which language model plays the tutor, observer and grader. The demo tutor works offline but cannot really teach.">
        <ChoiceGroup<LlmSettings['mode']>
          label="Provider"
          testId="llm-mode"
          value={llm.mode}
          onChange={(mode) => setLlm({ ...llm, mode })}
          options={[
            { value: 'mock', label: 'Demo tutor', description: 'A deterministic stand-in model. No network and no key, but it cannot really teach.' },
            { value: 'anthropic', label: 'Anthropic (Claude)', description: 'The tutor this app is built around.', detail: anthropicSettings },
            { value: 'ollama', label: 'Ollama', description: 'A model running on this machine. Expect rougher hints and grading.', detail: ollamaSettings },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={saveLlm} disabled={busy} data-testid="save-llm">Save tutor settings</Button>
          {busy ? <Spinner /> : null}
          <span className="text-xs text-muted">In use now: {app.llm.mode}{app.llm.note ? ` (${app.llm.note})` : ''}</span>
        </div>
      </Section>

      <Section id="scheduling" title="Scheduling" description={course ? `How much review the scheduler asks of you for “${course.title}”.` : 'Enrol in a course to set its review load.'}>
        {course ? (
          <>
            <Field label={`Target retention: ${(retention * 100).toFixed(0)}%`} hint="How likely you want to be to recall any card when it comes due. Higher means more frequent reviews; 90% is the usual sweet spot.">
              <input type="range" min={0.8} max={0.95} step={0.01} value={retention} onChange={(e) => setRetention(Number(e.target.value))} className="w-full accent-primary" aria-valuetext={`${(retention * 100).toFixed(0)}%`} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reviews per day, at most" hint="Cards due beyond this become review debt."><input type="number" min={1} className={inputClass} value={reviewsPerDay} onChange={(e) => setReviewsPerDay(Number(e.target.value))} /></Field>
              <Field label="New cards per day, at most" hint="Caps how many freshly learned cards join the rotation."><input type="number" min={0} className={inputClass} value={maxNew} onChange={(e) => setMaxNew(Number(e.target.value))} /></Field>
            </div>
            <p className="text-xs text-muted">Timezone {course.settings.timezone}; a study day starts at {course.settings.dayStartHour}:00. Tutor scaffolding: {course.scaffolding} (set from your background at enrolment).</p>
            <Button onClick={saveCourse} disabled={busy}>Save scheduling</Button>
          </>
        ) : null}
      </Section>

      <Section id="appearance" title="Appearance" description="Follow the system theme, or force light or dark.">
        <SegmentedGroup<'system' | 'light' | 'dark'> label="Theme" value={theme} onChange={applyTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Section>

      <Section id="account" title="Account and sync" description="Optional: sign in to keep courses and progress in sync across devices, or run the tutor through your own Supabase project.">
        <Link to="/account" className="text-sm font-medium text-accent underline-offset-2 hover:underline" data-testid="account-link">Open Account and sync</Link>
      </Section>

      <Section id="data" title="Data" description="Everything lives on this device. A backup is one SQLite file with your courses, cards, review log, receipts and sessions.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportDb} disabled={!canBackup} title={canBackup ? undefined : 'Not available on this platform'}>Download a backup</Button>
          <Button variant="secondary" onClick={importDb} disabled={!canBackup} title={canBackup ? 'Replaces everything with the backup' : 'Not available on this platform'}>Restore from a backup</Button>
        </div>
        {!canBackup ? <p className="text-xs text-muted">Backup is available in the browser build. On desktop, copy the database file directly.</p> : null}
      </Section>
    </Page>
  );
}
