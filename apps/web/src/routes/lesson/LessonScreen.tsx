import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Button, Card, Disclosure, ErrorBanner, Explainer, Skeleton } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { getGateOverrideDay } from '../../lib/settings.js';
import { LessonRunner, REMEDIATION_PREFIX } from '../../lib/services/lesson.js';
import { loadQueue, todayKey } from '../../lib/services/queue.js';
import { ChatPane } from './ChatPane.js';
import { LessonHeader, PHASE_LABEL } from './LessonHeader.js';
import { ConceptContext, SidePanel } from './SidePanel.js';
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

function LessonLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-3" data-testid="lesson-loading">
      <Skeleton lines={2} label={label} />
      <Card><Skeleton lines={4} /></Card>
    </div>
  );
}

export function LessonScreen() {
  const { lessonId = '' } = useParams();
  const gate = useGate(lessonId);
  if (gate.error) return <ErrorBanner title="Could not check the review gate" message={gate.error} onRetry={gate.refresh} />;
  if (!gate.data) return <LessonLoading label="Checking the review gate" />;
  if (!gate.data.open) {
    const notice = gate.data.recovery
      ? 'Recovery mode: the lesson is hidden until the backlog clears.'
      : `Reviews first: ${gate.data.due} review${gate.data.due === 1 ? '' : 's'} to go (~${gate.data.minutes} min) before this lesson unlocks. Clear them, or use today's one override.`;
    return <Navigate to="/today" replace state={{ notice }} />;
  }
  return <LessonBody lessonId={lessonId} />;
}

function LessonBody({ lessonId }: { lessonId: string }) {
  const ctx = useCourse();
  const [runner, setRunner] = useState<LessonRunner | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
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
  }, [ctx, lessonId, attempt]);

  if (error) return <ErrorBanner title="Could not open the lesson" message={error} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!runner) return <LessonLoading label="Opening the lesson" />;
  return <LessonView runner={runner} />;
}

function LessonView({ runner }: { runner: LessonRunner }) {
  const view = useStore(runner.store);
  const { state, lesson } = view;
  const isRemediation = view.isRemediation;
  // "How a lesson works" is worth a screen before the first answer and is clutter after it.
  const started = view.messages.some((m) => m.role === 'learner');

  if (view.inputMode === 'done') {
    const passed = Object.values(state.checkResults).filter((r) => r.rating >= 3).length;
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="lesson-done">
        <div className="text-sm text-muted"><Link to="/today" className="hover:underline">← Today</Link></div>
        <Card>
          <h1 className="text-lg font-semibold">{isRemediation ? 'Repair complete' : 'Lesson complete'}: {lesson.title}</h1>
          <p className="mt-2 text-sm text-muted">Unaided check passed on {passed} of {state.conceptIds.length} concept{state.conceptIds.length === 1 ? '' : 's'}. Their review cards are now active and will come due on Today.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {lesson.concepts.map((c) => {
              const r = state.checkResults[c.id];
              return (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className={r && r.rating >= 3 ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}>{r ? (r.rating >= 3 ? 'passed' : 'repair scheduled') : 'not checked'}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
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
        {started ? null : (
          <Explainer storageKey="lesson" title="How a lesson works" testId="lesson-explainer">
            <p>Each concept goes through six short steps: <strong>{PHASE_LABEL.PRIME}</strong> (a cold attempt), <strong>{PHASE_LABEL.PROBE}</strong>, <strong>{PHASE_LABEL.DEVELOP}</strong> (the tutor asks, hints only after you try), <strong>{PHASE_LABEL.CONSOLIDATE}</strong>, <strong>{PHASE_LABEL.EXTEND}</strong> (a new case) and <strong>{PHASE_LABEL.CHECK}</strong>, where the tutor goes silent and your answer is graded without help.</p>
            <p>The tutor never hands you the answer, and only the final check counts toward mastery. Where a step asks how sure you are, say so before you find out: that is how a lucky guess is told apart from knowing.</p>
          </Explainer>
        )}
        {view.error ? <ErrorBanner title="The tutor call failed" message={view.error} onRetry={() => runner.retry()} retryLabel="Retry" /> : null}
        <div className="lg:hidden">
          <Disclosure summary="About this concept" testId="concept-context-mobile">
            <ConceptContext concept={view.concept} lesson={lesson} phase={state.phase} />
          </Disclosure>
        </div>
        {view.inputMode === 'summary' || view.inputMode === 'jol' ? (
          <WrapPanel view={view} runner={runner} />
        ) : (
          <ChatPane view={view} runner={runner} />
        )}
      </div>
      <SidePanel concept={view.concept} lesson={lesson} phase={state.phase} />
    </div>
  );
}

export { REMEDIATION_PREFIX };
