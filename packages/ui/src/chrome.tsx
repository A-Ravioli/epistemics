/**
 * Window chrome: the parts of the app that are the *window* rather than a screen — the unified toolbar
 * across the top, the grouped sidebar, the pane header with its view tabs, and the inspector on the right.
 *
 * The shape is a macOS document window: one translucent sheet, a 52px toolbar that spans it edge to edge
 * (window controls, view toggles, a centred search field, then the two right-hand actions), and under it
 * three panes separated by hairlines — sidebar, content, inspector. See docs/DESIGN-SYSTEM.md §7.
 */
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

/**
 * The stoplight buttons, drawn in the browser build so a tab still reads as one window. The desktop build
 * does not use them: there the OS draws the real ones over the space `--window-controls-w` reserves.
 */
export function TrafficLights({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`} aria-hidden="true" data-testid="traffic-lights">
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <span key={c} className="h-[12px] w-[12px] rounded-full" style={{ background: c, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.12)' }} />
      ))}
    </span>
  );
}

/**
 * The toolbar: leading controls, a centred search field, trailing actions. It is a drag handle on the
 * desktop build (`app-region: drag`); anything interactive inside opts back out through `.no-drag`.
 */
export function Toolbar({ leading, center, trailing, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { leading?: ReactNode; center?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className={`toolbar relative z-20 flex h-[var(--toolbar-h)] shrink-0 items-center gap-2 px-3 ${className}`} data-testid="toolbar" {...rest}>
      <div className="no-drag flex min-w-0 flex-1 items-center gap-1.5">{leading}</div>
      {center ? <div className="no-drag hidden min-w-0 shrink justify-center md:flex md:basis-[380px] lg:basis-[460px]">{center}</div> : null}
      <div className="no-drag flex min-w-0 flex-1 items-center justify-end gap-2">{trailing}</div>
    </div>
  );
}

/** The search field in the middle of the toolbar. It is a button: clicking it opens the command palette. */
export function ToolbarSearch({ placeholder = 'Search', onOpen, hint = '⌘K', className = '', testId }: { placeholder?: string; onOpen: () => void; hint?: string; className?: string; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      className={`group flex h-8 w-full min-w-0 items-center justify-center gap-2 rounded-control bg-fill px-3 text-[13px] text-muted transition-[background-color,color] duration-150 ease-out hover:bg-fill-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <Icon name="search" size={14} />
      <span className="truncate">{placeholder}</span>
      <span className="ml-1 hidden shrink-0 rounded-md px-1 text-[11px] leading-4 text-muted opacity-70 lg:inline-block">{hint}</span>
    </button>
  );
}

/**
 * A raised pill in the toolbar: an icon, a label and a chevron that opens a small menu underneath.
 * `variant="accent"` is the one blue action a window is allowed (the toolbar's right-most button).
 */
export function MenuPill({ icon, label, items, variant = 'raised', className = '', testId }: { icon?: IconName; label: ReactNode; items: MenuItem[]; variant?: 'raised' | 'quiet'; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const skin = variant === 'raised' ? 'bg-surface text-ink shadow-raised hover:bg-surface' : 'bg-transparent text-muted hover:bg-fill hover:text-ink';
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        className={`inline-flex h-8 max-w-[190px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[13px] font-medium transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${skin} ${className}`}
      >
        {icon ? <Icon name={icon} size={14} /> : null}
        <span className="truncate">{label}</span>
        <Icon name="chevron-down" size={12} className="text-muted" />
      </button>
      {open ? <Menu items={items} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export interface MenuItem {
  label: ReactNode;
  onSelect?: () => void;
  /** A filled dot on the left says this is the option in force. */
  selected?: boolean;
  description?: string;
  disabled?: boolean;
  testId?: string;
}

/** The little floating list a `MenuPill` drops. The only thing besides the window that casts a shadow. */
export function Menu({ items, onClose, align = 'end' }: { items: MenuItem[]; onClose: () => void; align?: 'start' | 'end' }) {
  return (
    <div
      role="menu"
      className={`absolute top-[calc(100%+6px)] z-50 min-w-[230px] rounded-card bg-surface p-1 shadow-window ${align === 'end' ? 'right-0' : 'left-0'}`}
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          data-testid={it.testId}
          onClick={() => {
            it.onSelect?.();
            onClose();
          }}
          className="flex w-full items-start gap-2 rounded-control px-2.5 py-1.5 text-left text-[13px] text-ink transition-[background-color] duration-150 ease-out hover:bg-fill focus:outline-none focus-visible:bg-fill disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${it.selected ? 'bg-accent' : 'bg-transparent'}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate">{it.label}</span>
            {it.description ? <span className="mt-0.5 block text-[12px] leading-snug text-muted">{it.description}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/**
 * A collapsible group of sidebar rows: a quiet header with a chevron, then the rows. Groups are how the
 * sidebar stays one flat list of names instead of a tree of icons.
 */
export function SidebarGroup({ title, children, defaultOpen = true, action, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-1" data-testid={testId}>
      <div className="group flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-control px-3 py-1.5 text-left text-[14px] font-medium text-muted transition-[background-color,color] duration-150 ease-out hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="truncate">{title}</span>
          <Icon name="chevron-down" size={13} className={`shrink-0 transition-transform duration-150 ease-out ${open ? '' : '-rotate-90'}`} />
        </button>
        {action ? <span className="shrink-0 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">{action}</span> : null}
      </div>
      {open ? <div className="flex flex-col gap-px pb-1">{children}</div> : null}
    </section>
  );
}

/** Class for a sidebar row (a link or a button): one line of text, selection is a soft fill. */
export function sidebarRowClass(active: boolean): string {
  return `flex w-full items-center gap-2 rounded-control px-3 py-[7px] text-left text-[15px] leading-tight transition-[background-color,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active ? 'bg-fill-strong font-medium text-ink' : 'text-ink hover:bg-fill'
  }`;
}

/** Row body: the name, optionally a trailing count or state word in muted type. */
export function SidebarRow({ label, trailing, title }: { label: ReactNode; trailing?: ReactNode; title?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" title={title}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing ? <span className="shrink-0 text-[12px] tabular-nums text-muted">{trailing}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pane header and view tabs
// ---------------------------------------------------------------------------

export interface ViewTab<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

/**
 * The tabs at the top left of the content pane ("Plan / Canvas"): no track, the selected one is a raised
 * white pill. Use it for two or three views of the same thing — never for navigation.
 */
export function ViewTabs<T extends string>({ tabs, value, onChange, label = 'Views', className = '', testId }: { tabs: ViewTab<T>[]; value: T; onChange: (id: T) => void; label?: string; className?: string; testId?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex items-center gap-1 ${className}`} data-testid={testId}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={t.testId}
            onClick={() => onChange(t.id)}
            className={`h-8 shrink-0 whitespace-nowrap rounded-control px-3 text-[14px] transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              on ? 'bg-surface font-medium text-ink shadow-raised' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** The content pane's own header row: views on the left, the screen's actions on the right. */
export function PaneHeader({ children, actions, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { actions?: ReactNode }) {
  return (
    <div className={`flex h-[var(--pane-header-h)] shrink-0 items-center justify-between gap-3 border-b border-hairline-soft px-4 md:px-5 ${className}`} data-testid="pane-header" {...rest}>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A flat pill with a standing fill: the pane header's secondary action ("Peer review", "Export"). */
export function PaneButton({ icon, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-surface px-3 text-[13px] font-medium text-ink shadow-raised transition-[background-color,opacity] duration-150 ease-out hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

/** The pane header's "…": the same raised square as `PaneButton`, opening a menu of the rest. */
export function PaneMenu({ items, label = 'More', icon = 'more', testId }: { items: MenuItem[]; label?: string; icon?: IconName; testId?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-control bg-surface text-ink shadow-raised transition-opacity duration-150 ease-out hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name={icon} />
      </button>
      {open ? <Menu items={items} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

/**
 * The right-hand panel. Its tabs sit on the same line as the content pane's, so the two headers read as
 * one row across the window; under them it is a scrolling column of cards.
 */
export function Inspector<T extends string>({ tabs, value, onChange, children, label = 'Inspector', width = 'md' }: { tabs: ViewTab<T>[]; value: T; onChange: (id: T) => void; children: ReactNode; label?: string; width?: 'md' | 'lg' }) {
  return (
    <aside
      className={`pane-inspector hidden min-h-0 shrink-0 flex-col border-l border-hairline-soft lg:flex ${width === 'lg' ? 'w-[380px]' : 'w-[336px]'}`}
      aria-label={label}
      data-testid="inspector"
    >
      <div className="flex h-[var(--pane-header-h)] shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline-soft px-3">
        {tabs.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={t.testId}
              onClick={() => onChange(t.id)}
              className={`h-8 shrink-0 whitespace-nowrap rounded-control px-2.5 text-[13px] transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on ? 'bg-surface font-medium text-ink shadow-raised' : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

/**
 * One entry in the inspector: a mark, who or what it is from, when, and the body. `selected` tints the
 * whole row the way a chosen comment does — it is the only fill an inspector card ever has.
 */
export function NoteCard({ icon = 'check-square', title, time, children, selected = false, onClick, testId }: { icon?: IconName; title: ReactNode; time?: ReactNode; children: ReactNode; selected?: boolean; onClick?: () => void; testId?: string }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      data-testid={testId}
      className={`block w-full border-b border-hairline-soft px-4 py-3.5 text-left transition-[background-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'bg-fill' : onClick ? 'hover:bg-nested' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-ink"><Icon name={icon} size={18} /></span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{title}</span>
        {time ? <span className="shrink-0 text-[12px] text-muted">{time}</span> : null}
      </div>
      <div className="mt-1.5 text-[14px] leading-[1.45] text-ink">{children}</div>
    </Tag>
  );
}

/** A plain block inside the inspector for things that are not cards (a list of facts, a meter, a legend). */
export function InspectorSection({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-b border-hairline-soft px-4 py-4 last:border-b-0 ${className}`}>
      {title ? <div className="mb-2 text-[13px] font-medium text-muted">{title}</div> : null}
      <div className="text-[14px] leading-relaxed text-ink">{children}</div>
    </section>
  );
}
