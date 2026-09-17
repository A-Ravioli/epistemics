import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
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
import { AccountScreen } from '../routes/account/AccountScreen.js';
import { AppNav, type NavItem } from './AppNav.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const nav: readonly NavItem[] = [
  { to: '/today', label: 'Today', icon: 'today' },
  { to: '/shelf', label: 'Shelf', icon: 'shelf' },
  { to: '/map', label: 'Map', icon: 'map' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
  { to: '/account', label: 'Account', icon: 'user' },
];

function Boot({ error }: { error?: string }) {
  return (
    <div className="h-full p-0 md:p-4">
      <div className="surface flex h-full items-center justify-center p-6">
        {error ? (
          <Card className="max-w-lg" role="alert">
            <h1 className="text-[17px] font-semibold">Epistemics could not start</h1>
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

function Shell() {
  const app = useApp();
  const location = useLocation();
  const navigate = useNavigate();
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
    <div className="h-full p-0 md:p-4">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-chip focus:ring-2 focus:ring-accent">Skip to content</a>
      <div className="surface flex h-full flex-col overflow-hidden md:flex-row">
        {!focused ? <AppNav nav={nav} courseTitle={app.active?.course.title} tutorMode={app.llm.mode} /> : null}
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden" tabIndex={-1}>
          {app.storageNote ? <Banner tone="warn" className="mx-4 mt-4 shrink-0 md:mx-8">{app.storageNote}</Banner> : null}
          {app.llm.note ? <Banner tone="info" className="mx-4 mt-4 shrink-0 md:mx-8">{app.llm.note}</Banner> : null}
          <ErrorBoundary key={location.pathname} onReset={() => navigate('/today')}>
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
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
