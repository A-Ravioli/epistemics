import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { Confidence, Rating } from '@epistemics/core';
import { Icon } from './Icon.js';
import { Markdown } from './Markdown.js';
import { Button, Eyebrow, SegmentedGroup, Switch } from './primitives.js';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-surface border border-hairline-soft bg-surface p-6 shadow-window" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 type-title">{title}</h2>
        <div className="space-y-3 text-[15px]">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs (a rounded pill group with tab semantics)
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-fill p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${t.id === value ? 'bg-surface font-medium text-ink shadow-raised' : 'text-muted hover:text-ink'}`}
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
  const tones = { neutral: 'text-ink', good: 'text-green-fg', warn: 'text-yellow-fg', bad: 'text-red-fg' } as const;
  return (
    <div className="min-w-0 rounded-card border border-hairline-soft bg-surface p-4 shadow-raised">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${tones[tone]}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs leading-snug text-muted">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter (labelled bar with thresholds, e.g. review debt)
// ---------------------------------------------------------------------------

export function Meter({ label, value, max, tone = 'accent', suffix, className = '', hint, showMax = true }: { label: string; value: number; max: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; suffix?: string; className?: string; hint?: ReactNode; showMax?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const colors = { accent: 'bg-ink', good: 'bg-green-fg', warn: 'bg-yellow-fg', bad: 'bg-red-fg' } as const;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{value}{suffix ?? ''}{showMax && max > 0 ? ` / ${max}` : ''}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full rounded-full transition-[width] duration-150 ease-out ${colors[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <div className="mt-1.5 text-xs leading-snug text-muted">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat turns: the tutor reads like a document, the learner like a note
// ---------------------------------------------------------------------------

export function ChatBubble({ role, children, streaming = false, meta }: { role: 'tutor' | 'learner' | 'student' | 'system'; children: string; streaming?: boolean; meta?: ReactNode }) {
  if (role === 'system') {
    return (
      <div className="my-3 flex justify-center">
        <div className="max-w-md rounded-full bg-fill px-3 py-1 text-center text-xs text-muted">{children}</div>
      </div>
    );
  }
  const mine = role === 'learner';
  if (mine) {
    return (
      <div className="my-3 flex justify-end" data-role={role}>
        <div className="min-w-0 max-w-[88%] rounded-[16px] rounded-br-[6px] bg-fill px-4 py-2.5 text-[15px] text-ink sm:max-w-[80%]">
          {meta ? <Eyebrow className="mb-1">{meta}</Eyebrow> : null}
          <p className="whitespace-pre-wrap break-words">{children}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="my-4" data-role={role}>
      {meta ? <Eyebrow className="mb-1.5">{meta}</Eyebrow> : null}
      <Markdown className="reading text-ink">{children}</Markdown>
      {streaming ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted" data-testid="streaming-indicator">
          <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-ink align-middle" aria-hidden="true" />
          writing…
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence / rating pill groups
// ---------------------------------------------------------------------------

const CONFIDENCE_LABELS: Record<Confidence, string> = { 1: 'Guess', 2: 'Fairly sure', 3: 'Certain' };
const RATING_LABELS: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_HELP: Record<Rating, string> = { 1: 'Wrong or blank', 2: 'Right, with effort', 3: 'Right', 4: 'Right, instantly' };

export function ConfidenceButtons({ value, onChange, disabled, hotkeys = true }: { value?: Confidence; onChange: (c: Confidence) => void; disabled?: boolean; hotkeys?: boolean }) {
  return (
    <SegmentedGroup<Confidence>
      label="Confidence"
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={([1, 2, 3] as const).map((c) => ({ value: c, label: CONFIDENCE_LABELS[c], hotkey: hotkeys ? String(c) : undefined }))}
    />
  );
}

export function RatingButtons({ onRate, disabled, previews, hotkeys = true }: { onRate: (r: Rating) => void; disabled?: boolean; previews?: Partial<Record<Rating, string>>; hotkeys?: boolean }) {
  return (
    <SegmentedGroup<Rating>
      label="Rate your recall"
      onChange={onRate}
      disabled={disabled}
      options={([1, 2, 3, 4] as const).map((r) => ({
        value: r,
        label: RATING_LABELS[r],
        hotkey: hotkeys ? String(r) : undefined,
        sub: previews?.[r] ? `next in ${previews[r]}` : RATING_HELP[r],
        title: RATING_HELP[r],
        ariaLabel: `${RATING_LABELS[r]}: ${RATING_HELP[r]}${previews?.[r] ? `, next in ${previews[r]}` : ''}`,
      }))}
    />
  );
}

export { CONFIDENCE_LABELS, RATING_LABELS, RATING_HELP };

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fill-strong border-t-ink" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Banner({ tone = 'info', children, className = '', action, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'warn' | 'bad' | 'good'; action?: ReactNode }) {
  const tones = {
    info: 'bg-blue-bg text-blue-fg',
    warn: 'bg-yellow-bg text-yellow-fg',
    bad: 'bg-red-bg text-red-fg',
    good: 'bg-green-bg text-green-fg',
  } as const;
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-2 rounded-input px-3.5 py-2.5 text-sm ${tones[tone]} ${className}`} {...rest}>
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

/** Thin wrapper kept for call sites that only need a label and a value; `Switch` is the primitive. */
export function Toggle({ label, checked, onChange, description, disabled, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode; disabled?: boolean; testId?: string }) {
  return <Switch label={label} checked={checked} onChange={onChange} description={description} disabled={disabled} testId={testId} />;
}

/** Small disclosure used for receipts and details. */
export function Disclosure({ summary, children, defaultOpen = false, testId }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-input bg-nested" data-testid={testId}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-[background-color] duration-150 ease-out hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-expanded={open}>
        <span className="min-w-0">{summary}</span>
        <Icon name="chevron-down" className={`text-muted transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-hairline px-4 pb-3.5 pt-3 text-sm">{children}</div> : null}
    </div>
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
    <aside className="rounded-card bg-blue-bg p-4 text-sm text-blue-fg" data-testid={testId ?? `explainer-${storageKey}`} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-semibold">{title}</div>
          <div className="space-y-1 leading-relaxed">{children}</div>
        </div>
        <button type="button" onClick={dismiss} aria-label={`Dismiss: ${title}`} data-testid="explainer-dismiss" className="shrink-0 rounded-full border border-current/20 px-3 py-1 text-xs font-medium transition-[background-color] duration-150 ease-out hover:bg-surface/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Got it</button>
      </div>
    </aside>
  );
}
