import { useEffect, useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { Confidence, Rating } from '@epistemics/core';
import { Markdown } from './Markdown.js';
import { Button, Kbd } from './primitives.js';

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-lg border border-line bg-paper p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        <div className="space-y-3 text-sm">{children}</div>
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${t.id === value ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

export function Stat({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = { neutral: 'text-ink', good: 'text-emerald-700 dark:text-emerald-400', warn: 'text-amber-700 dark:text-amber-400', bad: 'text-rose-700 dark:text-rose-400' } as const;
  return (
    <div className="min-w-0 rounded-lg border border-line bg-paper p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter (labelled bar with thresholds, e.g. review debt)
// ---------------------------------------------------------------------------

export function Meter({ label, value, max, tone = 'accent', suffix, className = '', hint, showMax = true }: { label: string; value: number; max: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; suffix?: string; className?: string; hint?: ReactNode; showMax?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const colors = { accent: 'bg-accent', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' } as const;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{value}{suffix ?? ''}{showMax && max > 0 ? ` / ${max}` : ''}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-mist" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full rounded-full transition-all ${colors[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

export function ChatBubble({ role, children, streaming = false, meta }: { role: 'tutor' | 'learner' | 'student' | 'system'; children: string; streaming?: boolean; meta?: ReactNode }) {
  if (role === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <div className="max-w-md rounded-md bg-mist px-3 py-1.5 text-center text-xs text-muted">{children}</div>
      </div>
    );
  }
  const mine = role === 'learner';
  return (
    <div className={`my-2 flex ${mine ? 'justify-end' : 'justify-start'}`} data-role={role}>
      <div className={`min-w-0 max-w-[90%] rounded-lg px-3.5 py-2 text-sm sm:max-w-[85%] ${mine ? 'bg-accent/15 text-ink' : 'border border-line bg-paper text-ink'}`}>
        {meta ? <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{meta}</div> : null}
        {mine ? <p className="whitespace-pre-wrap break-words">{children}</p> : <Markdown>{children}</Markdown>}
        {streaming ? (
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted" data-testid="streaming-indicator">
            <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-accent align-middle" aria-hidden="true" />
            writing…
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence / rating buttons
// ---------------------------------------------------------------------------

const CONFIDENCE_LABELS: Record<Confidence, string> = { 1: 'Guess', 2: 'Fairly sure', 3: 'Certain' };
const RATING_LABELS: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_HELP: Record<Rating, string> = { 1: 'Wrong or blank', 2: 'Right, with effort', 3: 'Right', 4: 'Right, instantly' };
const RATING_TONES: Record<Rating, string> = {
  1: 'border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950',
  2: 'border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950',
  3: 'border-emerald-300 hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-950',
  4: 'border-sky-300 hover:bg-sky-50 dark:border-sky-700 dark:hover:bg-sky-950',
};

export function ConfidenceButtons({ value, onChange, disabled, hotkeys = true }: { value?: Confidence; onChange: (c: Confidence) => void; disabled?: boolean; hotkeys?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Confidence">
      {([1, 2, 3] as const).map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${value === c ? 'border-accent bg-accent/15 font-medium' : 'border-line bg-paper hover:bg-mist'}`}
        >
          {hotkeys ? <Kbd className="mr-1.5">{c}</Kbd> : null}
          {CONFIDENCE_LABELS[c]}
        </button>
      ))}
    </div>
  );
}

export function RatingButtons({ onRate, disabled, previews, hotkeys = true }: { onRate: (r: Rating) => void; disabled?: boolean; previews?: Partial<Record<Rating, string>>; hotkeys?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Rate your recall">
      {([1, 2, 3, 4] as const).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onRate(r)}
          title={RATING_HELP[r]}
          aria-label={`${RATING_LABELS[r]}: ${RATING_HELP[r]}${previews?.[r] ? `, next in ${previews[r]}` : ''}`}
          className={`flex min-w-[5.5rem] flex-col items-center rounded-md border bg-paper px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${RATING_TONES[r]}`}
        >
          <span>
            {hotkeys ? <Kbd className="mr-1.5">{r}</Kbd> : null}
            {RATING_LABELS[r]}
          </span>
          <span className="text-[11px] text-muted">{previews?.[r] ? `next in ${previews[r]}` : RATING_HELP[r]}</span>
        </button>
      ))}
    </div>
  );
}

export { CONFIDENCE_LABELS, RATING_LABELS, RATING_HELP };

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Banner({ tone = 'info', children, className = '', action, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'warn' | 'bad' | 'good'; action?: ReactNode }) {
  const tones = {
    info: 'border-accent/40 bg-accent/10 text-ink',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
    bad: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100',
    good: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  } as const;
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${tones[tone]} ${className}`} {...rest}>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Error banner with a retry button: the one shape every async screen uses when its load or call fails. */
export function ErrorBanner({ message, onRetry, retryLabel = 'Try again', title = 'Something went wrong', className = '' }: { message: string; onRetry?: () => void; retryLabel?: string; title?: string; className?: string }) {
  return (
    <Banner tone="bad" className={className} data-testid="error-banner" action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{retryLabel}</Button> : undefined}>
      <span className="font-medium">{title}.</span> <span className="break-words">{message}</span>
    </Banner>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );
}

/** Small disclosure used for receipts and details. */
export function Disclosure({ summary, children, defaultOpen = false, testId }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-line" data-testid={testId}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-expanded={open}>
        <span className="min-w-0">{summary}</span>
        <span className="text-muted" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="border-t border-line px-3 py-2 text-sm">{children}</div> : null}
    </div>
  );
}

/** Hint pips 0..max for the lesson header. */
export function Pips({ value, max = 3, label = 'Hint level' }: { value: number; max?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${label} ${value} of ${max}`} title={`${label} ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < value ? 'bg-accent' : 'bg-line'}`} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Explainer: a dismissible "how this works" card shown once per storage key
// ---------------------------------------------------------------------------

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(`epistemics:explainer:${key}`) === '1';
  } catch {
    return false;
  }
}

export function Explainer({ storageKey, title, children, testId }: { storageKey: string; title: string; children: ReactNode; testId?: string }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(`epistemics:explainer:${storageKey}`, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <aside className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm" data-testid={testId ?? `explainer-${storageKey}`} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-medium">{title}</div>
          <div className="space-y-1 text-ink/90">{children}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={dismiss} aria-label={`Dismiss: ${title}`} data-testid="explainer-dismiss" className="shrink-0 whitespace-nowrap">Got it</Button>
      </div>
    </aside>
  );
}
