import { useEffect, useState } from 'react';
import type { LlmRole } from '@epistemics/core';
import { DEFAULT_MODELS } from '@epistemics/llm';
import { Banner, Button, Card, Field, Spinner, Toggle, inputClass } from '@epistemics/ui';
import { useApp } from '../../lib/app-state.js';
import { API_KEY_SECRET } from '../../lib/llm.js';
import { getLlmSettings, setLlmSettings, type LlmSettings } from '../../lib/settings.js';
import { patchCourseSettings } from '../../lib/services/courses.js';

const ROLES: LlmRole[] = ['tutor', 'observer', 'grader', 'student', 'leakcheck'];

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
      if (web.setLlmMode) await web.setLlmMode(llm.transport);
      await app.reloadLlm();
      flash('LLM settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgetKey = async () => {
    await app.platform.secrets.delete(API_KEY_SECRET);
    setHasKey(false);
    await app.reloadLlm();
    flash('API key removed.');
  };

  const saveCourse = async () => {
    if (!course) return;
    setBusy(true);
    try {
      await patchCourseSettings(app.db, course.id, { desiredRetention: retention, reviewsPerDay, maxNewItemsPerDay: maxNew });
      await app.refreshCourses();
      flash('Course settings saved.');
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
  };

  const importDb = async () => {
    const p = app.platform as { importDatabase?: (b: Uint8Array) => Promise<void> };
    if (!p.importDatabase) return;
    const files = await app.platform.files.pick(['.sqlite', '.db', 'application/x-sqlite3']);
    const f = files[0];
    if (!f) return;
    if (!window.confirm('Replace the current database with this backup? This cannot be undone.')) return;
    await p.importDatabase(f.bytes);
    window.location.reload();
  };

  const canBackup = 'exportDatabase' in app.platform;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {saved ? <Banner tone="good">{saved}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Tutor model</h2>
        <Field label="Provider">
          <select className={inputClass} value={llm.mode} onChange={(e) => setLlm({ ...llm, mode: e.target.value as LlmSettings['mode'] })} data-testid="llm-mode">
            <option value="mock">Demo (mock model, no network)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </Field>
        {llm.mode === 'anthropic' ? (
          <>
            {app.platform.kind === 'web' ? (
              <Field label="Transport" hint="Proxy keeps the key on the server; BYOK stores it in this browser's IndexedDB and calls the API directly.">
                <select className={inputClass} value={llm.transport} onChange={(e) => setLlm({ ...llm, transport: e.target.value as LlmSettings['transport'] })}>
                  <option value="byok">Bring your own key (direct)</option>
                  <option value="proxy">Server proxy (/api/anthropic)</option>
                </select>
              </Field>
            ) : <p className="text-xs text-ink/60">On desktop the key lives in the OS keychain and never enters the app.</p>}
            {llm.transport === 'byok' || app.platform.kind === 'tauri' ? (
              <Field label={hasKey ? 'API key (stored; enter a new one to replace)' : 'API key'}>
                <div className="flex gap-2">
                  <input type="password" className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" data-testid="api-key" />
                  {hasKey ? <Button variant="secondary" onClick={forgetKey}>Forget</Button> : null}
                </div>
              </Field>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role) => (
                <Field key={role} label={`${role} model`}>
                  <input className={inputClass} value={llm.models[role] ?? ''} placeholder={DEFAULT_MODELS[role]} onChange={(e) => setLlm({ ...llm, models: { ...llm.models, [role]: e.target.value || undefined } })} />
                </Field>
              ))}
            </div>
            <Field label="Daily budget (USD per course, 0 = unlimited)" hint="The tutor degrades to Sonnet at 80% and stops at 100%.">
              <input type="number" min={0} step={0.5} className={inputClass} value={llm.dailyBudgetUsd} onChange={(e) => setLlm({ ...llm, dailyBudgetUsd: Number(e.target.value) })} />
            </Field>
          </>
        ) : null}
        {llm.mode === 'ollama' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ollama base URL"><input className={inputClass} value={llm.ollamaBaseUrl} onChange={(e) => setLlm({ ...llm, ollamaBaseUrl: e.target.value })} /></Field>
            <Field label="Model"><input className={inputClass} value={llm.ollamaModel} onChange={(e) => setLlm({ ...llm, ollamaModel: e.target.value })} /></Field>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button onClick={saveLlm} disabled={busy} data-testid="save-llm">Save</Button>
          {busy ? <Spinner /> : null}
          <span className="text-xs text-ink/60">Currently: {app.llm.mode}{app.llm.note ? ` (${app.llm.note})` : ''}</span>
        </div>
      </Card>

      {course ? (
        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Course: {course.title}</h2>
          <Field label={`Desired retention: ${(retention * 100).toFixed(0)}%`}>
            <input type="range" min={0.8} max={0.95} step={0.01} value={retention} onChange={(e) => setRetention(Number(e.target.value))} className="w-full accent-accent" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reviews per day"><input type="number" className={inputClass} value={reviewsPerDay} onChange={(e) => setReviewsPerDay(Number(e.target.value))} /></Field>
            <Field label="Max new items per day"><input type="number" className={inputClass} value={maxNew} onChange={(e) => setMaxNew(Number(e.target.value))} /></Field>
          </div>
          <p className="text-xs text-ink/60">Timezone {course.settings.timezone}, study day starts at {course.settings.dayStartHour}:00. Scaffolding: {course.scaffolding}.</p>
          <Button onClick={saveCourse} disabled={busy}>Save course settings</Button>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Appearance</h2>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Button key={t} variant={theme === t ? 'primary' : 'secondary'} onClick={() => applyTheme(t)}>{t}</Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Data</h2>
        <p className="text-sm text-ink/70">Full SQLite backup of everything: courses, cards, review log, receipts, sessions.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportDb} disabled={!canBackup}>Export backup</Button>
          <Button variant="secondary" onClick={importDb} disabled={!canBackup}>Import backup</Button>
        </div>
        {!canBackup ? <p className="text-xs text-ink/60">Backup is available in the browser build (OPFS). On desktop, copy the database file directly.</p> : null}
        <Toggle label="Verbose tutor" checked={false} onChange={() => undefined} />
      </Card>
    </div>
  );
}
