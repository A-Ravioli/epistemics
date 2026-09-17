import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Pill } from '@epistemics/ui';

export type NavItem = readonly [to: string, label: string];

/**
 * Primary navigation: a sidebar from the `md` breakpoint up, a sticky top bar with a disclosure menu below it.
 * Both render the same links so the route list in App.tsx stays the single source of truth.
 */
export function AppNav({ nav, courseTitle, tutorMode }: { nav: readonly NavItem[]; courseTitle?: string; tutorMode: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const demo = tutorMode === 'mock';

  const links = (onPick?: () => void) =>
    nav.map(([to, label]) => (
      <NavLink
        key={to}
        to={to}
        onClick={onPick}
        className={({ isActive }) => `rounded-md px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? 'bg-ink text-paper' : 'hover:bg-mist'}`}
      >
        {label}
      </NavLink>
    ));

  return (
    <>
      <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line bg-mist/40 p-3 md:flex" aria-label="Primary">
        <div className="mb-1 px-2 text-lg font-semibold tracking-tight">Epistemics</div>
        <div className="mb-3 truncate px-2 text-xs text-muted" title={courseTitle}>{courseTitle ?? 'No course yet'}</div>
        <nav className="flex flex-col gap-1" aria-label="Screens">{links()}</nav>
        <div className="mt-auto space-y-2 px-1 text-[11px] text-muted">
          {demo ? (
            <div data-testid="mock-banner" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" title="A deterministic stand-in tutor. Choose a real model in Settings.">Demo tutor (mock model)</div>
          ) : (
            <div>Tutor: {tutorMode}</div>
          )}
        </div>
      </aside>

      <div className="sticky top-0 z-30 border-b border-line bg-paper md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight tracking-tight">Epistemics</div>
            <div className="truncate text-xs text-muted" title={courseTitle}>{courseTitle ?? 'No course yet'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {demo ? <Pill tone="warn" title="Demo tutor (mock model)">Demo</Pill> : null}
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
              data-testid="menu-toggle"
            >
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        {open ? (
          <nav id="mobile-nav" className="flex flex-col gap-1 border-t border-line p-2" aria-label="Screens" data-testid="mobile-nav">
            {links(() => setOpen(false))}
          </nav>
        ) : null}
      </div>
    </>
  );
}
