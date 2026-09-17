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
import { AppNav } from './AppNav.js';
import { ErrorBoundary } from './ErrorBoundary.js';

const nav = [
  ['/today', 'Today'],
  ['/shelf', 'Shelf'],
  ['/map', 'Map'],
  ['/progress', 'Progress'],
  ['/settings', 'Settings'],
  ['/account', 'Account'],
] as const;

function Boot({ error }: { error?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      {error ? (
        <Card className="max-w-lg" role="alert">
          <h1 className="text-lg font-semibold">Epistemics could not start</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Reload</Button>
        </Card>
      ) : (
        <Spinner label="Opening your library" />
      )}
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
    <div className="flex h-full flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-accent">Skip to content</a>
      {!focused ? <AppNav nav={nav} courseTitle={app.active?.course.title} tutorMode={app.llm.mode} /> : null}
      <main id="main" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden" tabIndex={-1}>
        {app.storageNote ? <Banner tone="warn" className="m-4 mb-0">{app.storageNote}</Banner> : null}
        {app.llm.note ? <Banner tone="info" className="m-4 mb-0">{app.llm.note}</Banner> : null}
        <div className="p-4 md:p-6">
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
