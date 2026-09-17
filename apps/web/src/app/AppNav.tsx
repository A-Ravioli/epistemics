import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { IconButton, ListRow, Pill, navRowClass, type IconName } from '@epistemics/ui';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly meta: string;
  readonly icon: IconName;
}

/**
 * Primary navigation: the left panel of the surface from the `md` breakpoint up, a sticky top bar with a
 * disclosure menu below it. Both render the same rows so the route list in App.tsx stays the single source of truth.
 */
export function AppNav({ nav, courseTitle, tutorMode }: { nav: readonly NavItem[]; courseTitle?: string; tutorMode: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const demo = tutorMode === 'mock';

  const links = (onPick?: () => void) =>
    nav.map((item) => (
      <NavLink key={item.to} to={item.to} onClick={onPick} className={({ isActive }) => navRowClass(isActive)}>
        {({ isActive }) => <ListRow title={item.label} meta={item.meta} icon={item.icon} active={isActive} />}
      </NavLink>
    ));

  const tutorNote = demo ? (
    <div data-testid="mock-banner" className="rounded-[12px] bg-yellow-bg px-3 py-2 text-xs leading-snug text-yellow-fg" title="A deterministic stand-in tutor. Choose a real model in Settings.">
      <span className="font-semibold">Demo tutor</span> (mock model)
    </div>
  ) : (
    <div className="px-3 text-xs text-muted">Tutor: {tutorMode}</div>
  );

  return (
    <>
      <aside className="panel hidden w-[232px] shrink-0 flex-col border-r border-hairline p-3 md:flex" aria-label="Primary">
        <div className="mb-4 px-3 pt-2">
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">Epistemics</div>
          <div className="mt-0.5 truncate text-xs text-muted" title={courseTitle}>{courseTitle ?? 'No course yet'}</div>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Screens">{links()}</nav>
        <div className="mt-auto pt-4">{tutorNote}</div>
      </aside>

      <div className="panel sticky top-0 z-30 border-b border-hairline md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">Epistemics</div>
            <div className="truncate text-xs text-muted" title={courseTitle}>{courseTitle ?? 'No course yet'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {demo ? <Pill tone="warn" title="Demo tutor (mock model)">Demo</Pill> : null}
            <IconButton
              icon={open ? 'x' : 'menu'}
              label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((o) => !o)}
              data-testid="menu-toggle"
            />
          </div>
        </div>
        {open ? (
          <nav id="mobile-nav" className="flex flex-col gap-0.5 border-t border-hairline p-2" aria-label="Screens" data-testid="mobile-nav">
            {links(() => setOpen(false))}
          </nav>
        ) : null}
      </div>
    </>
  );
}
