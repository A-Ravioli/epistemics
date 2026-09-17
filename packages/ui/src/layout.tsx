import type { HTMLAttributes, ReactNode } from 'react';
import { Eyebrow } from './primitives.js';

const widths = { sm: 'max-w-2xl', md: 'max-w-3xl', lg: 'max-w-5xl', reading: 'max-w-[680px]', full: 'max-w-none' } as const;

/**
 * The column a screen is written in: a padded stack of sections against the left edge of the content pane,
 * the way a document sits in a window. The pane is already the right width, so the column never centres —
 * centring only ever produced a lonely strip with the inspector open on one side.
 */
export function Page({ width = 'md', className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { width?: keyof typeof widths }) {
  return <div className={`w-full ${widths[width]} space-y-5 px-5 py-6 md:px-7 md:py-7 ${className}`} {...rest} />;
}

/**
 * Centre panel plus a right panel (~300px) for secondary context, shown from `lg`. Superseded by the
 * window's own inspector (`useScreenChrome`); kept for screens whose context is part of the screen itself.
 */
export function Workspace({ children, aside, asideLabel, asideTestId, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { aside?: ReactNode; asideLabel?: string; asideTestId?: string }) {
  return (
    <div className={`flex min-h-0 flex-1 ${className}`} {...rest}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      {aside ? (
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto px-5 py-6 lg:block" aria-label={asideLabel} data-testid={asideTestId}>
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/** A titled section inside a right panel; space between sections, no rule. */
export function PanelSection({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`py-4 first:pt-0 last:pb-0 ${className}`}>
      {title ? <Eyebrow className="mb-2">{title}</Eyebrow> : null}
      {children}
    </section>
  );
}

/** Slim top row inside the centre panel: breadcrumbs (or a title) on the left, round icon chips on the right. */
export function TopBar({ children, actions, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { actions?: ReactNode }) {
  return (
    <div className={`flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 ${className}`} {...rest}>
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
