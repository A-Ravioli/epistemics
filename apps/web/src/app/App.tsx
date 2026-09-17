import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import { Banner, Button, Card, Inspector, PaneHeader, Spinner } from '@epistemics/ui';
import { AppProvider, useApp } from '../lib/app-state.js';
import { hasOverlayWindowControls, isDesktop } from '../lib/window.js';
import { TodayScreen } from '../routes/today/TodayScreen.js';
import { ReviewScreen } from '../routes/review/ReviewScreen.js';
import { LessonScreen } from '../routes/lesson/LessonScreen.js';
import { CheckpointScreen } from '../routes/checkpoint/CheckpointScreen.js';
import { DiagnosticScreen } from '../routes/diagnostic/DiagnosticScreen.js';
import { TeachbackScreen } from '../routes/teachback/TeachbackScreen.js';
import { MapScreen } from '../routes/map/MapScreen.js';
import { ShelfScreen } from '../routes/shelf/ShelfScreen.js';
import { SetupScreen } from '../routes/setup/SetupScreen.js';
import { ProgressScreen } from '../routes/progress/ProgressScreen.js';
import { SettingsScreen } from '../routes/settings/SettingsScreen.js';
import { AccountScreen } from '../routes/account/AccountScreen.js';
import { WelcomeScreen, isOnboarded } from '../routes/welcome/WelcomeScreen.js';
import { AppSidebar, type NavGroup } from './AppSidebar.js';
import { AppToolbar } from './AppToolbar.js';
import { ChromeProvider, useChrome } from './chrome.js';
import { CommandPalette, type Command } from './CommandPalette.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const groups: readonly NavGroup[] = [
  {
    title: 'Learn',
    items: [
      { to: '/today', label: 'Today', meta: 'Your next step' },
      { to: '/review', label: 'Review', meta: 'Cards due now' },
      { to: '/map', label: 'Map', meta: 'Prerequisite graph' },
      { to: '/progress', label: 'Progress', meta: 'Mastery and calibration' },
    ],
  },
  {
    title: 'Library',
    items: [
      { to: '/shelf', label: 'Shelf', meta: 'Courses and packs' },
      { to: '/setup', label: 'Build a course', meta: 'From a subject or your own files' },
    ],
  },
  {
    title: 'App',
    items: [
      { to: '/settings', label: 'Settings', meta: 'Tutor, scheduling, data' },
      { to: '/account', label: 'Account', meta: 'Sign in and sync' },
    ],
  },
];

/** The screen a path belongs to, for the pane header a screen has not set one of its own. */
function screenName(path: string): string {
  if (path.startsWith('/lesson')) return 'Lesson';
  if (path.startsWith('/checkpoint')) return 'Checkpoint';
  if (path.startsWith('/teachback')) return 'Teach back';
  if (path.startsWith('/diagnostic')) return 'Diagnostic';
  if (path.startsWith('/welcome')) return 'Welcome';
  for (const g of groups) {
    const hit = g.items.find((i) => path.startsWith(i.to));
    if (hit) return hit.label;
  }
  return 'Epistemics';
}

function Boot({ error }: { error?: string }) {
  return (
    <div className="h-full p-0 md:p-5 lg:p-7">
      <div className="surface flex h-full items-center justify-center p-6">
        {error ? (
          <Card className="max-w-lg" role="alert">
            <h1 className="type-heading">Epistemics could not start</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        ) : (
          <Spinner label="Opening your library" />
        )}
      </div>
    </div>
  );
}

/** Screens that need an active course send the learner to Today, which explains how to get one. */
export function RequireCourse({ children }: { children: ReactNode }) {
  const { ctx } = useApp();
  if (!ctx) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem('epistemics:sidebar') !== 'closed';
  } catch {
    return true;
  }
}

/** The right-hand panel, with the tab the learner last picked on this screen. */
function ScreenInspector() {
  const { inspector } = useChrome();
  const ids = inspector?.map((t) => t.id).join(',') ?? '';
  const [tab, setTab] = useState<string | undefined>(inspector?.[0]?.id);
  useEffect(() => {
    setTab((current) => (current && ids.split(',').includes(current) ? current : ids.split(',')[0]));
  }, [ids]);
  if (!inspector || inspector.length === 0) return null;
  const active = inspector.find((t) => t.id === tab) ?? inspector[0]!;
  return (
    <Inspector tabs={inspector.map((t) => ({ id: t.id, label: t.label, testId: t.testId }))} value={active.id} onChange={setTab}>
      {active.render()}
    </Inspector>
  );
}

function Shell() {
  const app = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const chrome = useChrome();
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** A checkpoint and a diagnostic are sat without help: the window keeps only its toolbar. */
  const focused = location.pathname.startsWith('/checkpoint') || location.pathname.startsWith('/diagnostic') || location.pathname.startsWith('/welcome');

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      const theme = localStorage.getItem('epistemics:theme');
      if (theme === 'dark' || theme === 'light') document.documentElement.dataset['theme'] = theme;
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (isDesktop()) {
      document.documentElement.dataset['windowDrag'] = 'on';
      document.documentElement.dataset['shell'] = 'desktop';
    }
    if (hasOverlayWindowControls()) document.documentElement.dataset['windowControls'] = 'overlay';
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem('epistemics:sidebar', open ? 'closed' : 'open');
      } catch {
        /* ignore */
      }
      return !open;
    });
  }, []);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    for (const g of groups) for (const i of g.items) list.push({ id: `nav:${i.to}`, label: i.label, group: g.title, hint: i.meta, run: () => navigate(i.to) });
    for (const c of app.courses) list.push({ id: `course:${c.id}`, label: c.title, group: 'Courses', hint: 'Open course', run: () => void app.setActiveCourse(c.id).then(() => navigate('/today')) });
    const cur = app.active;
    if (cur) {
      for (const u of cur.curriculum.units) {
        for (const l of u.lessons) list.push({ id: `lesson:${l.id}`, label: l.title, group: 'Lessons', hint: u.title, run: () => navigate(`/lesson/${l.id}`) });
      }
    }
    return list;
  }, [app, navigate]);

  const tutorItems = useMemo(
    () => [
      { label: 'Demo tutor', description: 'Offline stand-in; it cannot really teach.', selected: app.llm.mode === 'mock', onSelect: () => navigate('/settings') },
      { label: 'Claude', description: 'Anthropic, with your own key or a proxy.', selected: app.llm.mode === 'anthropic', onSelect: () => navigate('/settings') },
      { label: 'Ollama', description: 'A model on this machine.', selected: app.llm.mode === 'ollama', onSelect: () => navigate('/settings') },
      { label: 'Tutor settings…', onSelect: () => navigate('/settings') },
    ],
    [app.llm.mode, navigate],
  );

  return (
    <div className="app-frame h-full p-0 md:p-5 lg:p-7">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised focus:ring-2 focus:ring-accent">Skip to content</a>
      <div className="surface flex h-full flex-col overflow-hidden">
        <AppToolbar
          minimal={location.pathname.startsWith('/welcome')}
          showWindowControls={!isDesktop()}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          onOpenSearch={() => setSearchOpen(true)}
          onNewCourse={() => navigate('/setup')}
          tutorMode={app.llm.mode}
          tutorItems={tutorItems}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((o) => !o)}
          primary={{ label: 'New course', onClick: () => navigate('/setup'), testId: 'toolbar-primary' }}
        />

        {menuOpen ? (
          <div className="pane-nav border-b border-hairline-soft md:hidden" data-testid="mobile-nav" id="mobile-nav">
            <AppSidebar groups={groups} courses={app.courses} activeCourseId={app.active?.course.id} onPickCourse={(id) => void app.setActiveCourse(id)} onNavigate={() => setMenuOpen(false)} />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {!focused && sidebarOpen ? (
            <nav className="pane-nav hidden w-[var(--sidebar-w)] shrink-0 overflow-y-auto border-r border-hairline-soft md:block" aria-label="Primary">
              <AppSidebar groups={groups} courses={app.courses} activeCourseId={app.active?.course.id} onPickCourse={(id) => void app.setActiveCourse(id)} />
            </nav>
          ) : null}

          <div className="pane-content flex min-h-0 min-w-0 flex-1 flex-col">
            {!focused ? (
              <PaneHeader actions={chrome.actions}>
                {chrome.header ?? <span className="truncate text-[14px] text-muted">{screenName(location.pathname)}</span>}
              </PaneHeader>
            ) : null}
            <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden" tabIndex={-1}>
              {app.storageNote ? <Banner tone="warn" className="mx-4 mt-4 shrink-0 md:mx-8">{app.storageNote}</Banner> : null}
              {app.llm.note ? <Banner tone="info" className="mx-4 mt-4 shrink-0 md:mx-8">{app.llm.note}</Banner> : null}
              <ErrorBoundary key={location.pathname} onReset={() => navigate('/today')}>
                <Routes>
                  <Route path="/" element={<Navigate to={isOnboarded() ? '/today' : '/welcome'} replace />} />
                  <Route path="/welcome" element={<WelcomeScreen />} />
                  <Route path="/today" element={<TodayScreen />} />
                  <Route path="/review" element={<RequireCourse><ReviewScreen /></RequireCourse>} />
                  <Route path="/lesson/:lessonId" element={<RequireCourse><LessonScreen /></RequireCourse>} />
                  <Route path="/checkpoint/:unitId" element={<RequireCourse><CheckpointScreen /></RequireCourse>} />
                  <Route path="/diagnostic" element={<RequireCourse><DiagnosticScreen /></RequireCourse>} />
                  <Route path="/teachback/:conceptId" element={<RequireCourse><TeachbackScreen /></RequireCourse>} />
                  <Route path="/map" element={<RequireCourse><MapScreen /></RequireCourse>} />
                  <Route path="/progress" element={<RequireCourse><ProgressScreen /></RequireCourse>} />
                  <Route path="/shelf" element={<ShelfScreen />} />
                  <Route path="/setup" element={<SetupScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                  <Route path="/account" element={<AccountScreen />} />
                  <Route path="*" element={<Navigate to="/today" replace />} />
                </Routes>
              </ErrorBoundary>
            </main>
          </div>

          {!focused ? <ScreenInspector /> : null}
        </div>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} commands={commands} />
    </div>
  );
}

export function App() {
  return (
    <AppProvider fallback={(s) => <Boot error={s.error} />}>
      <ChromeProvider>
        <Shell />
      </ChromeProvider>
    </AppProvider>
  );
}
