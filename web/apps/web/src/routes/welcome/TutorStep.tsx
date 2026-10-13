import { Button, ChoiceGroup, Icon, inputClass } from '@epistemics/ui';
import type { Platform } from '@epistemics/platform';
import type { LlmMode, AnthropicTransport } from '../../lib/settings.js';

export interface TutorChoice {
  mode: LlmMode;
  transport: AnthropicTransport;
  apiKey: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

/**
 * Step 3 (ONBOARDING §3). The earliest point at which a key may be asked for, and still skippable. The
 * demo tutor is an explicit choice here rather than the consequence of skipping, because what it is and is
 * not able to do is the thing the learner needs told.
 */
export function TutorStep({
  value, onChange, platform, busy, onContinue, onSkip, standalone,
}: {
  value: TutorChoice;
  onChange: (v: TutorChoice) => void;
  platform: Platform;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
  /** True when the tutor is the only step: a second device that pulled a course over sync. */
  standalone: boolean;
}) {
  const patch = (p: Partial<TutorChoice>) => onChange({ ...value, ...p });
  const where = platform.kind === 'web' ? 'in this browser' : 'in the OS keychain';

  const anthropic = (
    <div className="space-y-3">
      <ChoiceGroup<AnthropicTransport>
        label="How Claude is reached"
        name="tutor-transport"
        value={value.transport}
        onChange={(transport) => patch({ transport })}
        className="-ml-3"
        options={[
          {
            value: 'byok',
            label: 'With my own API key',
            description: `Stored ${where}, sent straight to the API from this device.`,
            detail: (
              <div className="space-y-2">
                <input
                  type="password"
                  className={inputClass}
                  value={value.apiKey}
                  onChange={(e) => patch({ apiKey: e.target.value })}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  aria-label="Anthropic API key"
                  data-testid="welcome-api-key"
                />
                <p className="text-[13px] leading-relaxed text-muted">
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">Generate one here</a>. A lesson costs a few cents.
                </p>
              </div>
            ),
          },
          {
            value: 'proxy',
            label: 'Through a server I run',
            description: 'The key stays on the server; this app calls /api/anthropic under a daily budget.',
          },
        ]}
      />
    </div>
  );

  const ollama = (
    <div className="space-y-2">
      <input className={inputClass} value={value.ollamaBaseUrl} onChange={(e) => patch({ ollamaBaseUrl: e.target.value })} aria-label="Ollama base URL" placeholder="http://localhost:11434" />
      <input className={inputClass} value={value.ollamaModel} onChange={(e) => patch({ ollamaModel: e.target.value })} aria-label="Ollama model" placeholder="llama3.1" />
    </div>
  );

  return (
    <div className="space-y-6" data-testid="step-tutor">
      <header>
        <h1 className="type-display">Who is asking the questions?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {standalone
            ? 'Your courses and progress came over from your other device. The tutor does not: a key belongs to the device it is on.'
            : 'A lesson is a conversation — the tutor asks, withholds the answer, and grades what you write. It is the one part of this app that needs a model.'}
        </p>
      </header>

      <ChoiceGroup<LlmMode>
        label="Tutor"
        testId="welcome-tutor"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: 'anthropic', label: 'Claude', description: 'The tutor this app is built around, and what the prompts are tuned for.', detail: anthropic },
          { value: 'ollama', label: 'A model on this machine', description: 'Free and private through Ollama. Expect rougher hints and grading.', detail: ollama },
          { value: 'mock', label: 'The demo tutor', description: 'No key, no network — but it is a stand-in: it says the same thing in every phase and cannot really teach. Every screen works, so it is a fine way to look around.' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onContinue} disabled={busy} data-testid="onboarding-next">
          {value.mode === 'mock' ? 'Continue with the demo tutor' : 'Continue'}
        </Button>
        <button type="button" onClick={onSkip} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline" data-testid="onboarding-skip">Decide later</button>
      </div>

      <p className="flex items-center gap-1.5 text-[13px] text-muted">
        <Icon name="lock" size={13} />
        Whatever you pick, your answers and progress stay on this device. Change it any time in Settings.
      </p>
    </div>
  );
}
