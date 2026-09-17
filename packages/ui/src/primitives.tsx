import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90 disabled:bg-ink/40',
  secondary: 'bg-paper text-ink border border-line hover:bg-mist disabled:opacity-50',
  ghost: 'bg-transparent text-ink hover:bg-mist disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50',
};
const sizes = { md: 'px-3.5 py-2 text-sm', sm: 'px-2.5 py-1 text-xs' } as const;

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

/** A square button whose only content is a glyph; the accessible name is mandatory. */
export function IconButton({ label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <Button variant="ghost" aria-label={label} title={label} className={`h-8 w-8 px-0 py-0 ${className}`} {...rest} />;
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`min-w-0 rounded-lg border border-line bg-paper p-4 shadow-sm ${className}`} {...rest} />;
}

export function Pill({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; children: ReactNode; title?: string }) {
  const tones = {
    neutral: 'bg-mist text-ink',
    good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    bad: 'bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-100',
    accent: 'bg-accent/15 text-accent',
  } as const;
  return <span title={title} className={`inline-block shrink-0 self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-5 ${tones[tone]}`}>{children}</span>;
}

/** Keyboard key hint. */
export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <kbd className={`inline-block rounded border border-line bg-mist px-1 font-mono text-[11px] leading-4 text-muted ${className}`}>{children}</kbd>;
}

export function Progress({ value, max = 1, className = '', label = 'Progress' }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-mist ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'w-full min-w-0 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60';

export function EmptyState({ title, body, action, testId }: { title: string; body?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line p-6 text-center sm:p-10" data-testid={testId}>
      <p className="text-base font-medium text-ink">{title}</p>
      {body ? <div className="max-w-md text-sm text-muted">{body}</div> : null}
      {action}
    </div>
  );
}

/** Grey placeholder blocks shown while a screen's data loads. */
export function Skeleton({ lines = 3, className = '', label = 'Loading' }: { lines?: number; className?: string; label?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-live="polite" aria-label={label} data-testid="skeleton">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-mist" style={{ width: `${i === lines - 1 ? 55 : 100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

/** Consistent page header: optional back link (breadcrumb), title, one-line description, actions. */
export function PageHeader({ title, back, description, actions, meta, as: Tag = 'h1', testId }: { title: ReactNode; back?: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; as?: 'h1' | 'h2'; testId?: string }) {
  return (
    <header className="space-y-1" data-testid={testId}>
      {back ? <div className="text-sm text-muted">{back}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Tag className="text-2xl font-semibold leading-tight tracking-tight">{title}</Tag>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        {meta ? <div className="text-sm text-muted">{meta}</div> : null}
      </div>
    </header>
  );
}

/** Numbered horizontal steps ("1 Answer → 2 Confidence → 3 Reveal & rate"). */
export function Stepper({ steps, current, label = 'Steps' }: { steps: string[]; current: number; label?: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="flex items-center gap-1" aria-current={state === 'current' ? 'step' : undefined}>
            <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-medium ${state === 'current' ? 'bg-ink text-paper' : state === 'done' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100' : 'bg-mist text-muted'}`}>{i + 1}</span>
            <span className={state === 'current' ? 'font-medium text-ink' : 'text-muted'}>{s}</span>
            {i < steps.length - 1 ? <span className="mx-1 text-line" aria-hidden="true">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
