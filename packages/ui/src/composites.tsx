import { useEffect, useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { Confidence, Rating } from '@epistemics/core';
import { Markdown } from './Markdown.js';

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
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${t.id === value ? 'border-accent font-medium text-ink' : 'border-transparent text-ink/60 hover:text-ink'}`}
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

export function Stat({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = { neutral: 'text-ink', good: 'text-emerald-700 dark:text-emerald-400', warn: 'text-amber-700 dark:text-amber-400', bad: 'text-rose-700 dark:text-rose-400' } as const;
  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <div className="text-xs uppercase tracking-wide text-ink/60">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink/60">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter (labelled bar with thresholds, e.g. review debt)
// ---------------------------------------------------------------------------

export function Meter({ label, value, max, tone = 'accent', suffix, className = '' }: { label: string; value: number; max: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; suffix?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const colors = { accent: 'bg-accent', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' } as const;
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-xs text-ink/70">
        <span>{label}</span>
        <span className="tabular-nums">{value}{suffix ? ` ${suffix}` : ''}{max > 0 ? ` / ${max}` : ''}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-mist" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full rounded-full transition-all ${colors[tone]}`} style={{ width: `${pct}%` }} />
      </div>
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
        <div className="max-w-md rounded-md bg-mist px-3 py-1.5 text-center text-xs text-ink/70">{children}</div>
      </div>
    );
  }
  const mine = role === 'learner';
  return (
    <div className={`my-2 flex ${mine ? 'justify-end' : 'justify-start'}`} data-role={role}>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm ${mine ? 'bg-accent/15 text-ink' : 'border border-line bg-paper text-ink'}`}>
        {meta ? <div className="mb-1 text-[11px] uppercase tracking-wide text-ink/50">{meta}</div> : null}
        {mine ? <p className="whitespace-pre-wrap">{children}</p> : <Markdown>{children}</Markdown>}
        {streaming ? <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-accent align-middle" aria-label="streaming" /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence / rating buttons
// ---------------------------------------------------------------------------

const CONFIDENCE_LABELS: Record<Confidence, string> = { 1: 'Guess', 2: 'Fairly sure', 3: 'Certain' };
const RATING_LABELS: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_TONES: Record<Rating, string> = {
  1: 'border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950',
  2: 'border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950',
  3: 'border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950',
  4: 'border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950',
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
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${value === c ? 'border-accent bg-accent/15 font-medium' : 'border-line bg-paper hover:bg-mist'}`}
        >
          {hotkeys ? <kbd className="mr-1.5 rounded bg-mist px-1 text-[11px] text-ink/60">{c}</kbd> : null}
          {CONFIDENCE_LABELS[c]}
        </button>
      ))}
    </div>
  );
}

export function RatingButtons({ onRate, disabled, previews, hotkeys = true }: { onRate: (r: Rating) => void; disabled?: boolean; previews?: Partial<Record<Rating, string>>; hotkeys?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Rating">
      {([1, 2, 3, 4] as const).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onRate(r)}
          className={`flex min-w-[5.5rem] flex-col items-center rounded-md border bg-paper px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${RATING_TONES[r]}`}
        >
          <span>
            {hotkeys ? <kbd className="mr-1.5 rounded bg-mist px-1 text-[11px] text-ink/60">{r}</kbd> : null}
            {RATING_LABELS[r]}
          </span>
          {previews?.[r] ? <span className="text-[11px] text-ink/60">{previews[r]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export { CONFIDENCE_LABELS, RATING_LABELS };

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink/70" role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function Banner({ tone = 'info', children, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'warn' | 'bad' | 'good' }) {
  const tones = {
    info: 'border-accent/40 bg-accent/10 text-ink',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    bad: 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
    good: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  } as const;
  return <div role="status" className={`rounded-md border px-3 py-2 text-sm ${tones[tone]} ${className}`} {...rest}>{children}</div>;
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
export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" aria-expanded={open}>
        <span>{summary}</span>
        <span className="text-ink/50">{open ? '−' : '+'}</span>
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
