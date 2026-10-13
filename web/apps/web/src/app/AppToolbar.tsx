import { Button, Icon, IconButton, MenuPill, Toolbar, ToolbarSearch, TrafficLights, type MenuItem } from '@epistemics/ui';

/** What the tutor pill says: the model in use now, in the learner's words rather than the settings' words. */
const TUTOR_LABEL: Record<string, string> = { mock: 'Demo tutor', anthropic: 'Claude', ollama: 'Ollama' };

export function tutorLabel(mode: string): string {
  return TUTOR_LABEL[mode] ?? mode;
}

/**
 * The window's toolbar. Left: the window buttons, the sidebar toggle and "build a course". Middle: search,
 * which opens the command palette. Right: which tutor is answering, and the one blue action in the window.
 */
export function AppToolbar({
  minimal = false,
  showWindowControls,
  sidebarOpen,
  onToggleSidebar,
  onOpenSearch,
  onNewCourse,
  tutorMode,
  tutorItems,
  menuOpen,
  onToggleMenu,
  primary,
}: {
  /** Onboarding: the window is one decision wide, so the toolbar is only the window buttons. */
  minimal?: boolean;
  showWindowControls: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onNewCourse: () => void;
  tutorMode: string;
  tutorItems: MenuItem[];
  menuOpen: boolean;
  onToggleMenu: () => void;
  primary?: { label: string; onClick: () => void; testId?: string };
}) {
  if (minimal) {
    return <Toolbar leading={showWindowControls ? <TrafficLights className="hidden md:flex" /> : null} />;
  }
  return (
    <Toolbar
      leading={
        <>
          {showWindowControls ? <TrafficLights className="mr-2 hidden md:flex" /> : null}
          {/* Tailwind resolves `hidden` and `inline-flex` by source order, not class order, so the
              breakpoint lives on a wrapper rather than on the button's own class list. */}
          <span className="hidden items-center gap-1.5 md:flex">
            <IconButton
              icon="sidebar"
              size="sm"
              label={sidebarOpen ? 'Hide the sidebar' : 'Show the sidebar'}
              aria-pressed={sidebarOpen}
              onClick={onToggleSidebar}
              data-testid="sidebar-toggle"
            />
            <IconButton icon="compose" size="sm" label="Build a course" onClick={onNewCourse} data-testid="toolbar-new" />
          </span>
          <span className="flex items-center gap-2 md:hidden">
            <IconButton
              icon={menuOpen ? 'x' : 'menu'}
              size="sm"
              label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={onToggleMenu}
              data-testid="menu-toggle"
            />
            <span className="hidden truncate text-[13px] font-semibold text-ink sm:inline">Epistemics</span>
          </span>
        </>
      }
      center={<ToolbarSearch onOpen={onOpenSearch} testId="toolbar-search" />}
      trailing={
        <>
          <span className="flex md:hidden"><IconButton icon="search" size="sm" label="Search" onClick={onOpenSearch} /></span>
          <MenuPill
            icon="spark"
            label={tutorLabel(tutorMode)}
            items={tutorItems}
            testId={tutorMode === 'mock' ? 'mock-banner' : 'tutor-pill'}
          />
          {primary ? (
            <Button size="sm" className="h-8 rounded-control px-3.5" onClick={primary.onClick} data-testid={primary.testId}>
              <Icon name="plus" size={14} />
              <span className="hidden sm:inline">{primary.label}</span>
            </Button>
          ) : null}
        </>
      }
    />
  );
}
