import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * Actions are pills, and they are the only filled things on a screen. One accent button — the thing we
 * want done — and everything else is a flat grey pill (`secondary`) or plain text on a hover fill (`ghost`).
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40',
  secondary: 'bg-fill text-ink hover:bg-fill-strong disabled:opacity-50',
  ghost: 'bg-transparent text-ink hover:bg-fill disabled:opacity-50',
  danger: 'bg-red-bg text-red-fg hover:opacity-90 disabled:opacity-50',
};
/** `lg` is the single call to action a focused screen ends on; `md` is every other button. */
const sizes = { lg: 'h-12 px-7 text-[17px] font-semibold', md: 'h-10 px-5 text-[15px]', sm: 'h-8 px-3.5 text-[13px]' } as const;

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,opacity,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:active:scale-100 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

/**
 * Round icon button: nothing but the glyph until you hover. `raised` gives it a standing fill where it has
 * to be findable at a glance. With `caption`, a tiny label sits under it.
 */
export function IconButton({ label, icon, caption, size = 'md', tone = 'ghost', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon?: IconName; caption?: string; size?: 'md' | 'sm'; tone?: 'ghost' | 'raised' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const skin = tone === 'raised' ? 'bg-fill text-ink hover:bg-fill-strong' : 'bg-transparent text-muted hover:bg-fill hover:text-ink';
  const chip = (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${skin} ${caption ? '' : className}`}
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

/**
 * A block of content. Not a box: no border, no shadow, no fill — space and a heading do the grouping.
 * `nested` gives the one soft fill we allow, for a passage that is quoted rather than written by the page.
 */
export function Card({ className = '', nested = false, interactive = false, ...rest }: HTMLAttributes<HTMLDivElement> & { nested?: boolean; interactive?: boolean }) {
  return <div className={`min-w-0 ${nested ? 'rounded-card bg-nested p-4' : ''} ${interactive ? 'cursor-pointer' : ''} ${className}`} {...rest} />;
}

export function SectionTitle({ children, className = '', as: Tag = 'h2' }: { children: ReactNode; className?: string; as?: 'h2' | 'h3' }) {
  return <Tag className={`type-heading ${className}`}>{children}</Tag>;
}

/** Quiet label above a group of things (a panel section, a phase, a card eyebrow). */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[13px] font-medium text-muted ${className}`}>{children}</div>;
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
  return <kbd className={`inline-block rounded-md bg-fill-strong px-1.5 font-mono text-[11px] leading-4 text-muted ${className}`}>{children}</kbd>;
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

/** Text inputs are filled and borderless; the ring on focus is the only outline they ever get. */
export const inputClass = 'w-full min-w-0 appearance-none rounded-input border border-transparent bg-fill px-4 py-2.5 text-[15px] leading-normal text-ink transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-muted focus:outline-none focus-visible:border-transparent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';

// ---------------------------------------------------------------------------
// Switch and choices
// ---------------------------------------------------------------------------

/**
 * On/off switch: an accent track when on, a neutral one when off, with a white knob that slides.
 * For a setting that takes effect immediately — never as a substitute for a submit button.
 */
export function Switch({ checked, onChange, label, description, disabled, className = '', testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean; className?: string; testId?: string }) {
  const id = useId();
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <label htmlFor={id} className={`block text-[15px] leading-tight ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>{label}</label>
        {description ? <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        data-testid={testId}
        className={`relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-fill-strong'}`}
      >
        <span className={`inline-block h-[26px] w-[26px] rounded-full bg-white shadow-raised transition-transform duration-200 ease-out ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} aria-hidden="true" />
      </button>
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** One line under the label saying what picking this means. */
  description?: ReactNode;
  /** Shown only while this option is the selected one (a key field, a URL). */
  detail?: ReactNode;
  disabled?: boolean;
}

/**
 * One-of-N as a stack of rows with a filled accent circle on the selected one. Use it instead of a
 * `<select>` when each option needs a sentence of explanation, and when there are no more than four.
 */
export function ChoiceGroup<T extends string>({ options, value, onChange, label, name, className = '', testId }: { options: ChoiceOption<T>[]; value: T; onChange: (v: T) => void; label: string; name?: string; className?: string; testId?: string }) {
  const auto = useId();
  const group = name ?? auto;
  return (
    <div role="radiogroup" aria-label={label} className={`space-y-1 ${className}`} data-testid={testId}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <div key={o.value}>
            <label className={`flex items-start gap-3 rounded-input px-3 py-2.5 transition-[background-color] duration-150 ease-out ${o.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-fill'}`}>
              <input
                type="radio"
                name={group}
                value={o.value}
                checked={selected}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span aria-hidden="true" className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${selected ? 'border-accent bg-accent text-on-accent' : 'border-hairline bg-surface'}`}>
                {selected ? <Icon name="check" size={12} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-tight">{o.label}</span>
                {o.description ? <span className="mt-1 block text-[13px] leading-snug text-muted">{o.description}</span> : null}
              </span>
            </label>
            {selected && o.detail ? <div className="mb-1 ml-8 mr-3 mt-1.5 space-y-3">{o.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty and loading states
// ---------------------------------------------------------------------------

export function EmptyState({ title, body, action, testId }: { title: string; body?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" data-testid={testId}>
      <p className="type-heading">{title}</p>
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
      <div className="space-y-1.5">
        <Tag className="type-display">{title}</Tag>
        {description ? <p className="max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p> : null}
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
    <ol className={`inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-fill p-1 text-xs ${className}`} aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${state === 'current' ? 'bg-surface font-medium text-ink' : state === 'done' ? 'text-green-fg' : 'text-muted'}`} aria-current={state === 'current' ? 'step' : undefined}>
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

/** Rounded pill group for one-of-N choices (confidence, rating, theme): a grey track, the selected segment white. */
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
            className={`flex min-w-0 flex-col items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ${selected ? 'bg-surface font-medium text-ink' : 'text-muted hover:text-ink'}`}
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

/** Class for the anchor around a nav row: selection is a soft fill, never a border or a shadow. */
export function navRowClass(active: boolean): string {
  return `block rounded-control px-3 py-2 transition-[background-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'bg-fill-strong' : 'hover:bg-fill'}`;
}

/** Nav row body: an icon and the screen's name. `meta` is a tooltip, not a second line. */
export function ListRow({ title, meta, icon, active = false }: { title: ReactNode; meta?: string; icon?: IconName; active?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" title={meta}>
      {icon ? <span className={`shrink-0 ${active ? 'text-ink' : 'text-muted'}`}><Icon name={icon} /></span> : null}
      <span className={`min-w-0 flex-1 truncate text-sm leading-tight ${active ? 'font-semibold text-ink' : 'text-ink'}`}>{title}</span>
    </span>
  );
}
