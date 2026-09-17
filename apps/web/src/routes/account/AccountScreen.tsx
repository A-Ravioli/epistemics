/**
 * Account and sync: Supabase project settings, sign in / sign up / magic link, sync status and controls,
 * and the "tutor via edge function" transport toggle. Everything here is optional; the app is local-first.
 */
import { useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Page, PageHeader, SectionTitle, Spinner, Toggle, inputClass } from '@epistemics/ui';
import { useApp } from '../../lib/app-state.js';
import { envSupabaseDefaults, getLlmSettings, setLlmSettings } from '../../lib/settings.js';
import { configureSupabase, refreshPending, sendMagicLink, signIn, signOut, signUp, syncNow, useSyncState } from '../../lib/sync.js';
import { syncEvents } from '../../lib/sync-events.js';

function when(ts: number | undefined): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function AccountScreen() {
  const app = useApp();
  const sync = useSyncState();
  const env = envSupabaseDefaults();
  const [url, setUrl] = useState(sync.settings.supabaseUrl);
  const [anonKey, setAnonKey] = useState(sync.settings.supabaseAnonKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [viaEdge, setViaEdge] = useState(app.llmSettings.viaSupabase === true);
  /** False until the pending count has been recounted for this visit (tests wait on it). */
  const [pendingFresh, setPendingFresh] = useState(false);

  useEffect(() => {
    setUrl(sync.settings.supabaseUrl);
    setAnonKey(sync.settings.supabaseAnonKey);
  }, [sync.settings.supabaseUrl, sync.settings.supabaseAnonKey]);

  useEffect(() => {
    let live = true;
    refreshPending().finally(() => { if (live) setPendingFresh(true); });
    const off = syncEvents.on('activity', () => void refreshPending());
    return () => { live = false; off(); };
  }, []);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const m = await fn();
      setMessage(m ?? label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProject = () => run('Supabase project saved.', async () => {
    await configureSupabase({ supabaseUrl: url, supabaseAnonKey: anonKey });
  });

  const useDefaults = () => {
    if (!env) return;
    setUrl(env.supabaseUrl);
    setAnonKey(env.supabaseAnonKey);
  };

  const toggleEdge = (on: boolean) => run(on ? 'Tutor now runs through your Supabase edge function.' : 'Tutor transport reset to your own key.', async () => {
    setViaEdge(on);
    const llm = await getLlmSettings(app.db);
    await setLlmSettings(app.db, { ...llm, mode: on ? 'anthropic' : llm.mode, viaSupabase: on });
    await app.reloadLlm();
  });

  const status = sync.status;
  const signedIn = !!sync.user;
  const shownError = error ?? sync.authError ?? status.lastError;

  return (
    <Page width="sm" data-testid="account-screen">
      <PageHeader title="Account and sync" description="Everything stays on this device until you sign in. Signing in syncs your courses, cards, reviews and sessions to your own Supabase project and to any other device signed in with the same account." />
      {message ? <Banner tone="good">{message}</Banner> : null}
      {shownError ? <Banner tone="bad" data-testid="account-error">{shownError}</Banner> : null}

      <Card className="space-y-3">
        <SectionTitle>Supabase project</SectionTitle>
        <Field label="Project URL" hint="Project settings → API → Project URL, e.g. https://abcdefgh.supabase.co">
          <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://<ref>.supabase.co" data-testid="supabase-url" autoComplete="off" />
        </Field>
        <Field label="Anon (public) key">
          <input className={inputClass} type="password" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJ…" data-testid="supabase-anon-key" autoComplete="off" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={saveProject} disabled={busy} data-testid="save-supabase">Save</Button>
          {env ? <Button variant="secondary" onClick={useDefaults} disabled={busy} data-testid="use-defaults">Use defaults</Button> : null}
          <span className="text-xs text-muted" data-testid="sync-configured">{sync.configured ? 'Configured' : 'Not configured: sync is off'}</span>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Account</SectionTitle>
        {signedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm" data-testid="signed-in-as">Signed in as <strong>{sync.user?.email ?? sync.user?.id}</strong></span>
            <Button variant="secondary" onClick={() => run('Signed out.', () => signOut())} disabled={busy} data-testid="sign-out">Sign out</Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="email" /></Field>
              <Field label="Password"><input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="password" /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run('Signed in.', () => signIn(email, password))} disabled={busy || !sync.configured || !email || !password} data-testid="sign-in">Sign in</Button>
              <Button variant="secondary" onClick={() => run('Account created.', async () => (await signUp(email, password)) ? 'Account created: check your email to confirm, then sign in.' : 'Account created and signed in.')} disabled={busy || !sync.configured || !email || !password} data-testid="sign-up">Sign up</Button>
              <Button variant="secondary" onClick={() => run('Magic link sent: check your email.', () => sendMagicLink(email))} disabled={busy || !sync.configured || !email} data-testid="magic-link">Email me a magic link</Button>
              {busy ? <Spinner /> : null}
            </div>
            {!sync.configured ? <p className="text-xs text-muted">Enter your Supabase project above to enable sign-in.</p> : null}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Sync</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-muted">State</dt><dd data-testid="sync-state">{signedIn ? status.state : 'signed out'}</dd>
          <dt className="text-muted">Pending changes</dt><dd data-testid="outbox-count" data-fresh={pendingFresh ? 'true' : 'false'}>{status.pending}</dd>
          <dt className="text-muted">Last push</dt><dd>{when(status.lastPushAt)}</dd>
          <dt className="text-muted">Last pull</dt><dd>{when(status.lastPullAt)}</dd>
        </dl>
        {status.lastError ? <p className="text-xs text-red-fg" data-testid="sync-error">Last sync error: {status.lastError}</p> : null}
        <div className="flex items-center gap-2">
          <Button onClick={() => run('Synced.', async () => { const s = await syncNow(); return s.state === 'error' ? `Sync failed: ${s.lastError}` : `Synced (${s.pushed} pushed, ${s.pulled} pulled so far).`; })} disabled={busy || !signedIn} data-testid="sync-now">Sync now</Button>
          <span className="text-xs text-muted">Runs on start, when the app becomes visible, after each session, and every minute while signed in.</span>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Tutor via Supabase edge function</SectionTitle>
        <p className="text-sm text-muted">Route Claude calls through the <code>anthropic-proxy</code> function of your project: the Anthropic key lives in the function's secrets, the request carries your session token, and a daily budget is enforced server-side.</p>
        <Toggle label="Use the edge function for the tutor" checked={viaEdge} onChange={(v) => void toggleEdge(v)} />
        {viaEdge && !signedIn ? <p className="text-xs text-muted">Sign in to activate; the demo tutor is used until then.</p> : null}
        {viaEdge && sync.settings.supabaseUrl ? <p className="text-xs text-muted">Endpoint: {sync.settings.supabaseUrl}/functions/v1/anthropic-proxy</p> : null}
      </Card>
    </Page>
  );
}
