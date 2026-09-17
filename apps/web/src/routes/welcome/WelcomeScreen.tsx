import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ErrorBanner, Icon, Spinner, SwitchControl, inputClass, type IconName } from '@epistemics/ui';
import { useApp } from '../../lib/app-state.js';
import { API_KEY_SECRET } from '../../lib/llm.js';
import { setLlmSettings } from '../../lib/settings.js';

const ONBOARDED = 'epistemics:onboarded';

/** True once the learner has been through (or past) the provider screen on this device. */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED) === '1';
  } catch {
    return true; // no storage: never trap anyone on the welcome screen
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED, '1');
  } catch {
    /* ignore */
  }
}

/** One provider: its mark and name, a switch that turns it on, and the fields it needs once it is on. */
function Provider({ name, icon, on, onToggle, children, testId }: { name: string; icon: IconName; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode; testId: string }) {
  return (
    <section className="px-1 md:px-8" data-testid={testId}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2.5 text-[17px] font-medium text-ink">
          <Icon name={icon} size={20} className="text-accent" />
          <span className="truncate">{name}</span>
        </span>
        <SwitchControl checked={on} onChange={onToggle} label={name} testId={`${testId}-switch`} />
      </div>
      <div className={`mt-6 space-y-4 transition-opacity duration-200 ${on ? '' : 'pointer-events-none select-none opacity-40'}`} aria-hidden={!on}>
        {children}
      </div>
    </section>
  );
}

/** A radio in the provider column: a filled dot, a line of text, and whatever the choice needs under it. */
function Choice({ label, checked, onSelect, name, children }: { label: React.ReactNode; checked: boolean; onSelect: () => void; name: string; children?: React.ReactNode }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
        <span aria-hidden="true" className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 ${checked ? 'border-accent bg-accent text-on-accent' : 'border-hairline bg-surface'}`}>
          {checked ? <Icon name="check" size={12} /> : null}
        </span>
        <span className="min-w-0 flex-1 text-[15px] leading-tight">{label}</span>
      </label>
      {checked && children ? <div className="ml-8 mt-2 space-y-2">{children}</div> : null}
    </div>
  );
}

/**
 * First launch: which model plays the tutor. It is the whole window — no sidebar, no inspector — because
 * it is one decision, and it is the only screen in the app that is a form before it is a conversation.
 */
export function WelcomeScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const [claudeOn, setClaudeOn] = useState(false);
  const [ollamaOn, setOllamaOn] = useState(false);
  const [transport, setTransport] = useState<'byok' | 'proxy'>('byok');
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState(app.llmSettings.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(app.llmSettings.ollamaModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const mode = claudeOn ? 'anthropic' : ollamaOn ? 'ollama' : 'mock';
  const cta = mode === 'mock' ? 'Continue with the demo tutor' : 'Continue';

  const finish = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (claudeOn && transport === 'byok' && apiKey.trim()) await app.platform.secrets.set(API_KEY_SECRET, apiKey.trim());
      await setLlmSettings(app.db, { ...app.llmSettings, mode, transport, ollamaBaseUrl: ollamaUrl, ollamaModel });
      const web = app.platform as { setLlmMode?: (m: 'proxy' | 'byok') => Promise<void> };
      if (web.setLlmMode && mode === 'anthropic') await web.setLlmMode(transport);
      await app.reloadLlm();
      markOnboarded();
      navigate('/today', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const skip = () => {
    markOnboarded();
    navigate('/today', { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-10" data-testid="welcome-screen">
      <div className="w-full max-w-[920px]">
        <h1 className="text-center type-display">Configure your tutor</h1>
        <p className="mx-auto mt-2 max-w-[520px] text-center text-[15px] leading-relaxed text-muted">
          Pick the model that asks the questions, gives the hints and grades your answers. You can change it later in Settings.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-hairline-soft">
          <Provider name="Claude" icon="spark" on={claudeOn} onToggle={setClaudeOn} testId="provider-claude">
            <Choice label="Use a server proxy" name="claude-transport" checked={transport === 'proxy'} onSelect={() => setTransport('proxy')}>
              <p className="text-[13px] leading-relaxed text-muted">The key stays on your server; this app calls <code className="font-mono text-[12px]">/api/anthropic</code> with a daily budget.</p>
            </Choice>
            <Choice
              label="Enter your Anthropic API key"
              name="claude-transport"
              checked={transport === 'byok'}
              onSelect={() => setTransport('byok')}
            >
              <p className="text-[13px] leading-relaxed text-muted">
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">Visit Claude</a> to generate a new API key. It is stored {app.platform.kind === 'web' ? 'in this browser' : 'in the OS keychain'} and never leaves this device.
              </p>
              <input
                type="password"
                className={inputClass}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                aria-label="Anthropic API key"
                data-testid="welcome-api-key"
              />
            </Choice>
          </Provider>

          <Provider name="Ollama" icon="cube" on={ollamaOn} onToggle={setOllamaOn} testId="provider-ollama">
            <p className="text-[13px] leading-relaxed text-muted">A model running on this machine. Free and private; expect rougher hints and grading than Claude.</p>
            <input className={inputClass} value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} aria-label="Ollama base URL" placeholder="http://localhost:11434" />
            <input className={inputClass} value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} aria-label="Ollama model" placeholder="llama3.1" />
          </Provider>
        </div>

        {error ? <div className="mx-auto mt-8 w-full max-w-[420px]"><ErrorBanner message={error} /></div> : null}

        <div className="mt-12 flex flex-col items-center gap-3">
          <Button size="lg" className="w-full max-w-[420px]" onClick={finish} disabled={busy} data-testid="welcome-continue">{cta}</Button>
          {busy ? <Spinner label="Saving" /> : (
            <button type="button" onClick={skip} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline" data-testid="welcome-skip">Skip for now</button>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
            <Icon name="lock" size={13} />
            Your data lives on your computer.
          </p>
        </div>
      </div>
    </div>
  );
}
