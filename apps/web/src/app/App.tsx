import { useEffect, type ReactNode } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router';
import { Banner, Button, Card, Spinner } from '@epistemics/ui';
import { AppProvider, useApp } from '../lib/app-state.js';
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

const nav = [
  ['/today', 'Today'],
  ['/shelf', 'Shelf'],
  ['/map', 'Map'],
  ['/progress', 'Progress'],
  ['/settings', 'Settings'],
] as const;

function Boot({ error }: { error?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      {error ? (
        <Card className="max-w-lg">
          <h1 className="text-lg font-semibold">Epistemics could not start</h1>
          <p className="mt-2 text-sm text-ink/70">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
        </Card>
      ) : (
        <Spinner label="Opening your library" />
      )}
    </div>
  );
}

/** Screens that need an active course redirect to the shelf when there is none. */
export function RequireCourse({ children }: { children: ReactNode }) {
  const { ctx } = useApp();
  if (!ctx) return <Navigate to="/shelf" replace state={{ reason: 'no-course' }} />;
  return <>{children}</>;
}

function Shell() {
  const app = useApp();
  const location = useLocation();
  const focused = location.pathname.startsWith('/checkpoint') || location.pathname.startsWith('/diagnostic');
  useEffect(() => {
    try {
      const theme = localStorage.getItem('epistemics:theme');
      if (theme === 'dark' || theme === 'light') document.documentElement.dataset['theme'] = theme;
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <div className="flex h-full">
      {!focused ? (
        <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-line bg-mist/40 p-3">
          <div className="mb-1 px-2 text-base font-semibold tracking-tight">Epistemics</div>
          {app.active ? <div className="mb-3 truncate px-2 text-xs text-ink/60" title={app.active.course.title}>{app.active.course.title}</div> : <div className="mb-3 px-2 text-xs text-ink/60">No course yet</div>}
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `rounded-md px-2 py-1.5 text-sm ${isActive ? 'bg-ink text-paper' : 'hover:bg-mist'}`}>
              {label}
            </NavLink>
          ))}
          <div className="mt-auto space-y-2 px-1 text-[11px] text-ink/60">
            {app.llm.mode === 'mock' ? <div data-testid="mock-banner" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Demo tutor (mock model)</div> : <div>Tutor: {app.llm.mode}</div>}
          </div>
        </aside>
      ) : null}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {app.storageNote ? <Banner tone="warn" className="m-4 mb-0">{app.storageNote}</Banner> : null}
        {app.llm.note ? <Banner tone="info" className="m-4 mb-0">{app.llm.note}</Banner> : null}
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<RequireCourse><TodayScreen /></RequireCourse>} />
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
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AppProvider fallback={(s) => <Boot error={s.error} />}>
      <Shell />
    </AppProvider>
  );
}
