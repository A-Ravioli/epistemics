/**
 * App-wide state: platform, db, LLM provider, the active course context and settings, plus a small
 * `useQuery` hook for async screen data with refresh.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from 'react';
import type { Course, Curriculum, Scheduler } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import { getCurriculum } from '@epistemics/db';
import type { Platform } from '@epistemics/platform';
import { getDb } from './db.js';
import { buildProvider, type LlmRuntime } from './llm.js';
import { getPlatform } from './platform.js';
import { getActiveCourseId, getLlmSettings, setActiveCourseId, type LlmSettings } from './settings.js';
import type { CourseContext } from './services/context.js';
import { listMyCourses } from './services/courses.js';
import { schedulerForCourse } from './services/scheduler.js';
import { startSync } from './sync.js';
import { syncEvents } from './sync-events.js';

export interface ActiveCourse {
  course: Course;
  curriculum: Curriculum;
  scheduler: Scheduler;
}

export interface AppState {
  platform: Platform;
  db: Db;
  llm: LlmRuntime;
  llmSettings: LlmSettings;
  courses: Course[];
  active?: ActiveCourse;
  ctx?: CourseContext;
  /** Set when the browser could not persist (private mode): data is lost on reload. */
  storageNote?: string;
  refreshCourses(): Promise<void>;
  setActiveCourse(id: string | undefined): Promise<void>;
  reloadLlm(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error('useApp outside AppProvider');
  return s;
}

/** The active course context; screens that need one are wrapped in <RequireCourse>. */
export function useCourse(): CourseContext {
  const { ctx } = useApp();
  if (!ctx) throw new Error('No active course');
  return ctx;
}

async function loadActive(db: Db, courses: Course[], id: string | undefined): Promise<ActiveCourse | undefined> {
  const course = courses.find((c) => c.id === id) ?? courses[0];
  if (!course) return undefined;
  const curriculum = await getCurriculum(db, course.curriculumId, course.curriculumVersion);
  if (!curriculum) return undefined;
  return { course, curriculum, scheduler: await schedulerForCourse(db, course) };
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback?: (status: { error?: string }) => ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | undefined>();

  const boot = useCallback(async () => {
    const platform = await getPlatform();
    const db = await getDb();
    await startSync(platform, db).catch((e: unknown) => console.warn('[sync] not started', e)); // optional; never blocks boot
    const llmSettings = await getLlmSettings(db);
    const llm = await buildProvider(platform, db, llmSettings);
    const courses = await listMyCourses(db);
    const active = await loadActive(db, courses, await getActiveCourseId(db));
    const storage = (platform as { storage?: string }).storage;
    const storageNote = storage === 'memory' ? 'Persistent storage is unavailable in this browser session; your data will be lost on reload.' : undefined;

    const make = (base: Omit<AppState, 'refreshCourses' | 'setActiveCourse' | 'reloadLlm' | 'ctx'>): AppState => {
      const ctx: CourseContext | undefined = base.active
        ? { db: base.db, provider: base.llm.provider, course: base.active.course, curriculum: base.active.curriculum, scheduler: base.active.scheduler, now: () => Date.now(), ledger: base.llm.ledger, dailyBudgetUsd: base.llmSettings.dailyBudgetUsd }
        : undefined;
      const s: AppState = {
        ...base,
        ctx,
        async refreshCourses() {
          const list = await listMyCourses(base.db);
          // The stored id wins: enrolling sets it, so a freshly created course becomes the one Today shows.
          const act = await loadActive(base.db, list, (await getActiveCourseId(base.db)) ?? base.active?.course.id);
          setState(make({ ...base, courses: list, active: act }));
        },
        async setActiveCourse(id) {
          await setActiveCourseId(base.db, id);
          const list = await listMyCourses(base.db);
          setState(make({ ...base, courses: list, active: await loadActive(base.db, list, id) }));
        },
        async reloadLlm() {
          const settings = await getLlmSettings(base.db);
          const runtime = await buildProvider(base.platform, base.db, settings);
          setState(make({ ...base, llmSettings: settings, llm: runtime }));
        },
      };
      return s;
    };
    setState(make({ platform, db, llm, llmSettings, courses, active, storageNote }));
  }, []);

  useEffect(() => {
    boot().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [boot]);

  // A sync pull may have brought new courses or progress: refresh the course list.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => syncEvents.on('pulled', () => void stateRef.current?.refreshCourses().catch(() => undefined)), []);

  if (!state) return <>{fallback ? fallback({ error }) : null}</>;
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Minimal async data hook: runs `fn` on mount and whenever `deps` change; `refresh` re-runs it. */
export function useQuery<T>(fn: () => Promise<T>, deps: DependencyList): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (id === seq.current) {
        setData(d);
        setError(undefined);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void run(), [run, ...deps]);

  return useMemo(() => ({ data, error, loading, refresh: run }), [data, error, loading, run]);
}
