import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Banner, Button, Card, Spinner } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { getGateOverrideDay } from '../../lib/settings.js';
import { LessonRunner, REMEDIATION_PREFIX } from '../../lib/services/lesson.js';
import { loadQueue, todayKey } from '../../lib/services/queue.js';
import { ChatPane } from './ChatPane.js';
import { LessonHeader } from './LessonHeader.js';
import { SidePanel } from './SidePanel.js';
import { WrapPanel } from './WrapPanel.js';

/** Review gate (DESIGN §5.4): lessons open only when nothing is due, unless today's one override was used. */
function useGate(lessonId: string) {
  const ctx = useCourse();
  return useQuery(async () => {
    const q = await loadQueue(ctx);
    const override = (await getGateOverrideDay(ctx.db, ctx.course.id)) === todayKey(ctx);
    const open = (q.queue.gateOpen && !q.queue.recoveryMode) || (override && !q.queue.recoveryMode);
    return { open, due: q.queue.dueToday, minutes: q.minutes, recovery: q.queue.recoveryMode };
  }, [ctx.course.id, lessonId]);
}

export function LessonScreen() {
  const { lessonId = '' } = useParams();
  const gate = useGate(lessonId);
  if (gate.error) return <Banner tone="bad">{gate.error}</Banner>;
  if (!gate.data) return <Spinner label="Checking the review gate" />;
  if (!gate.data.open) {
    const notice = gate.data.recovery
      ? 'Recovery mode: the lesson is hidden until the backlog clears.'
      : `The review gate is closed: ${gate.data.due} review${gate.data.due === 1 ? '' : 's'} to go (~${gate.data.minutes} min). Clear them or use today's override.`;
    return <Navigate to="/today" replace state={{ notice }} />;
  }
  return <LessonBody lessonId={lessonId} />;
}

function LessonBody({ lessonId }: { lessonId: string }) {
  const ctx = useCourse();
  const [runner, setRunner] = useState<LessonRunner | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    LessonRunner.open(ctx, lessonId)
      .then((r) => {
        if (cancelled) return;
        setRunner(r);
        void r.start();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [ctx, lessonId]);

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!runner) return <Spinner label="Opening the lesson" />;
  return <LessonView runner={runner} />;
}

function LessonView({ runner }: { runner: LessonRunner }) {
  const view = useStore(runner.store);
  const { state, lesson } = view;
  const isRemediation = view.isRemediation;

  if (view.inputMode === 'done') {
    const passed = Object.values(state.checkResults).filter((r) => r.rating >= 3).length;
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="lesson-done">
        <Card>
          <h1 className="text-lg font-semibold">{isRemediation ? 'Remediation complete' : 'Lesson complete'}: {lesson.title}</h1>
          <p className="mt-2 text-sm text-ink/70">Unaided CHECK passed on {passed} of {state.conceptIds.length} concept{state.conceptIds.length === 1 ? '' : 's'}. Their items are now in the review stream.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {lesson.concepts.map((c) => {
              const r = state.checkResults[c.id];
              return (
                <li key={c.id} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className={r && r.rating >= 3 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>{r ? (r.rating >= 3 ? 'passed' : 'to remediate') : 'not checked'}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <Link to="/today"><Button data-testid="back-to-today">Back to Today</Button></Link>
            <Link to="/map"><Button variant="secondary">Course map</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-4" data-testid="lesson-screen">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <LessonHeader view={view} />
        {view.error ? (
          <Banner tone="bad" className="flex items-center justify-between gap-3">
            <span>{view.error}</span>
            <Button variant="secondary" onClick={() => runner.retry()}>Retry</Button>
          </Banner>
        ) : null}
        {view.inputMode === 'summary' || view.inputMode === 'jol' ? (
          <WrapPanel view={view} runner={runner} />
        ) : (
          <ChatPane view={view} runner={runner} />
        )}
      </div>
      <SidePanel concept={view.concept} lesson={lesson} />
    </div>
  );
}

export { REMEDIATION_PREFIX };
