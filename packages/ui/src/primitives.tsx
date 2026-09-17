import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 disabled:opacity-40',
  secondary: 'bg-surface text-ink border border-hairline shadow-chip hover:bg-fill disabled:opacity-50 disabled:shadow-none',
  ghost: 'bg-transparent text-ink hover:bg-fill disabled:opacity-50',
  danger: 'bg-red-bg text-red-fg hover:opacity-90 disabled:opacity-50',
};
const sizes = { md: 'h-9 px-4 text-sm', sm: 'h-7 px-3 text-xs' } as const;

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,opacity,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

/**
 * Circular white chip with a hairline and a soft shadow. Content is an icon (or a glyph); the accessible name
 * is mandatory. With `caption`, a tiny label sits under the chip, as in a toolbar.
 */
export function IconButton({ label, icon, caption, size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon?: IconName; caption?: string; size?: 'md' | 'sm' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const chip = (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink shadow-chip transition-[background-color,box-shadow] duration-150 ease-out hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${caption ? '' : className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
  if (!caption) return chip;
  return (
    <span className={`inline-flex flex-col items-center gap-1 ${className}`}>
      {chip}
      <span className="text-[11px] leading-none text-muted" aria-hidden="true">{caption}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** White card with a hairline; `nested` gives the off-white fill used inside another card; `interactive` lifts on hover. */
export function Card({ className = '', nested = false, interactive = false, ...rest }: HTMLAttributes<HTMLDivElement> & { nested?: boolean; interactive?: boolean }) {
  return <div className={`min-w-0 rounded-card border border-hairline p-4 sm:p-5 ${nested ? 'bg-nested' : 'bg-surface'} ${interactive ? 'liftable' : ''} ${className}`} {...rest} />;
}

export function SectionTitle({ children, className = '', as: Tag = 'h2' }: { children: ReactNode; className?: string; as?: 'h2' | 'h3' }) {
  return <Tag className={`text-[15px] font-semibold leading-snug tracking-[-0.01em] ${className}`}>{children}</Tag>;
}

/** Tiny uppercase label for a group of things (a panel section, a phase, a card eyebrow). */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-muted ${className}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Pills, keys
// ---------------------------------------------------------------------------

export type PillTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'purple' | 'lime';
export const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-fill text-ink',
  good: 'bg-green-bg text-green-fg',
  warn: 'bg-yellow-bg text-yellow-fg',
  bad: 'bg-red-bg text-red-fg',
  accent: 'bg-blue-bg text-blue-fg',
  purple: 'bg-purple-bg text-purple-fg',
  lime: 'bg-lime-bg text-lime-fg',
};

export function Pill({ tone = 'neutral', children, title, className = '' }: { tone?: PillTone; children: ReactNode; title?: string; className?: string }) {
  return <span title={title} className={`inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ${PILL_TONES[tone]} ${className}`}>{children}</span>;
}

/** Keyboard key hint. */
export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <kbd className={`inline-block rounded-md border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-4 text-muted ${className}`}>{children}</kbd>;
}

// ---------------------------------------------------------------------------
// Progress, fields
// ---------------------------------------------------------------------------

export function Progress({ value, max = 1, className = '', label = 'Progress' }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-fill ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-ink transition-[width] duration-150 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'w-full min-w-0 rounded-input border border-hairline bg-nested px-3.5 py-2.5 text-[15px] leading-normal text-ink transition-[box-shadow,border-color] duration-150 ease-out placeholder:text-muted focus:outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';

// ---------------------------------------------------------------------------
// Empty and loading states
// ---------------------------------------------------------------------------

export function EmptyState({ title, body, action, testId }: { title: string; body?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hairline bg-nested p-6 text-center sm:p-10" data-testid={testId}>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? <div className="max-w-md text-sm text-muted">{body}</div> : null}
      {action}
    </div>
  );
}

/** Grey placeholder blocks shown while a screen's data loads. */
export function Skeleton({ lines = 3, className = '', label = 'Loading' }: { lines?: number; className?: string; label?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} role="status" aria-live="polite" aria-label={label} data-testid="skeleton">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded-full bg-fill" style={{ width: `${i === lines - 1 ? 55 : 100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header with breadcrumbs
// ---------------------------------------------------------------------------

export interface Crumb {
  label: string;
  /** Route path (HashRouter): rendered as `#path`. The last crumb is the current page and has none. */
  to?: string;
}

/** Slim breadcrumb row: "My courses / Probability / Lesson 3" in small muted text, the current crumb in ink. */
export function Breadcrumbs({ crumbs, className = '', testId }: { crumbs: Crumb[]; className?: string; testId?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`} data-testid={testId}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {c.to && !last ? (
                <a href={`#${c.to}`} className="truncate rounded-sm hover:text-ink hover:underline" data-testid={i === 0 ? 'crumb-root' : undefined}>{c.label}</a>
              ) : (
                <span className={`truncate ${last ? 'font-medium text-ink' : ''}`} aria-current={last ? 'page' : undefined}>{c.label}</span>
              )}
              {!last ? <span aria-hidden="true" className="select-none text-muted opacity-50">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Consistent page header: an optional slim top row (breadcrumbs left, round icon chips or buttons right),
 * then the title, one-line description and meta.
 */
export function PageHeader({ title, crumbs, description, actions, meta, as: Tag = 'h1', testId, className = '' }: { title: ReactNode; crumbs?: Crumb[]; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; as?: 'h1' | 'h2'; testId?: string; className?: string }) {
  return (
    <header className={`space-y-3 ${className}`} data-testid={testId}>
      {crumbs || actions ? (
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {crumbs ? <Breadcrumbs crumbs={crumbs} /> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="space-y-1">
        <Tag className="text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">{title}</Tag>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
        {meta ? <div className="text-[13px] text-muted">{meta}</div> : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Stepper and segmented groups
// ---------------------------------------------------------------------------

/** Slim pill row of numbered steps ("1 Answer · 2 Confidence · 3 Reveal & rate"). */
export function Stepper({ steps, current, label = 'Steps', className = '' }: { steps: string[]; current: number; label?: string; className?: string }) {
  return (
    <ol className={`inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-fill p-0.5 text-xs ${className}`} aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${state === 'current' ? 'bg-surface font-medium text-ink shadow-chip' : state === 'done' ? 'text-green-fg' : 'text-muted'}`} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' ? <Icon name="check" size={12} /> : <span className="tabular-nums">{i + 1}</span>}
            <span>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Small second line under the label (e.g. "next in 2 d"). */
  sub?: ReactNode;
  /** Keyboard key hint shown before the label. */
  hotkey?: string;
  title?: string;
  ariaLabel?: string;
}

/** Rounded pill group for one-of-N choices (confidence, rating, theme). Buttons carry `aria-pressed`. */
export function SegmentedGroup<T extends string | number>({ options, value, onChange, disabled, label, className = '', size = 'md', testId }: { options: SegmentedOption<T>[]; value?: T; onChange: (v: T) => void; disabled?: boolean; label: string; className?: string; size?: 'md' | 'sm'; testId?: string }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-fill p-1 ${className}`} data-testid={testId}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            aria-label={o.ariaLabel}
            title={o.title}
            className={`flex min-w-0 flex-col items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${selected ? 'bg-surface font-medium text-ink shadow-chip' : 'text-muted hover:text-ink'}`}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {o.hotkey ? <Kbd className="hidden sm:inline-block">{o.hotkey}</Kbd> : null}
              {o.label}
            </span>
            {o.sub ? <span className="text-[11px] font-normal text-muted">{o.sub}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav list row
// ---------------------------------------------------------------------------

/** Class for the anchor around a nav row: soft grey rounded fill when selected, a lighter fill on hover. */
export function navRowClass(active: boolean): string {
  return `block rounded-[12px] px-3 py-2 transition-[background-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'bg-fill-strong' : 'hover:bg-fill'}`;
}

/** Two-line nav row body: icon, title and a small muted meta line. */
export function ListRow({ title, meta, icon, active = false }: { title: ReactNode; meta?: ReactNode; icon?: IconName; active?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      {icon ? <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-surface text-ink shadow-chip' : 'text-muted'}`}><Icon name={icon} /></span> : null}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm leading-tight ${active ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{title}</span>
        {meta ? <span className="block truncate text-xs leading-tight text-muted">{meta}</span> : null}
      </span>
    </span>
  );
}
