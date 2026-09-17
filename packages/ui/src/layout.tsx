import type { HTMLAttributes, ReactNode } from 'react';
import { Eyebrow } from './primitives.js';

const widths = { sm: 'max-w-2xl', md: 'max-w-3xl', lg: 'max-w-5xl', reading: 'max-w-[680px]', full: 'max-w-none' } as const;

/** The centre column of a screen: a padded, centred stack of sections. */
export function Page({ width = 'md', className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { width?: keyof typeof widths }) {
  return <div className={`mx-auto w-full ${widths[width]} space-y-5 px-4 py-5 md:px-8 md:py-7 ${className}`} {...rest} />;
}

/**
 * Centre panel plus a hairline-separated right panel (~300px) for secondary context, shown from `lg`.
 * The two scroll independently; below `lg` the caller shows the same context another way (a disclosure).
 */
export function Workspace({ children, aside, asideLabel, asideTestId, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { aside?: ReactNode; asideLabel?: string; asideTestId?: string }) {
  return (
    <div className={`flex min-h-0 flex-1 ${className}`} {...rest}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      {aside ? (
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-hairline px-5 py-6 lg:block" aria-label={asideLabel} data-testid={asideTestId}>
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/** A titled section inside a right panel; hairline between sections. */
export function PanelSection({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-hairline py-4 first:border-t-0 first:pt-0 last:pb-0 ${className}`}>
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
