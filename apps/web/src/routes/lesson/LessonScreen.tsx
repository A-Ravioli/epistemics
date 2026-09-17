import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Button, Card, Disclosure, ErrorBanner, Explainer, Icon, Page, PageHeader, Skeleton, Workspace } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { getGateOverrideDay } from '../../lib/settings.js';
import { LessonRunner, REMEDIATION_PREFIX } from '../../lib/services/lesson.js';
import { loadQueue, todayKey } from '../../lib/services/queue.js';
import { ChatPane } from './ChatPane.js';
import { LessonHeader, PHASE_LABEL } from './LessonHeader.js';
import { ConceptContext, SIDE_PANEL_LABEL } from './SidePanel.js';
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
    <Page width="reading" data-testid="lesson-loading">
      <Skeleton lines={2} label={label} />
      <Card><Skeleton lines={4} /></Card>
    </Page>
  );
}

export function LessonScreen() {
  const { lessonId = '' } = useParams();
  const gate = useGate(lessonId);
  if (gate.error) return <Page><ErrorBanner title="Could not check the review gate" message={gate.error} onRetry={gate.refresh} /></Page>;
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

  if (error) return <Page><ErrorBanner title="Could not open the lesson" message={error} onRetry={() => setAttempt((a) => a + 1)} /></Page>;
  if (!runner) return <LessonLoading label="Opening the lesson" />;
  return <LessonView runner={runner} />;
}

function LessonView({ runner }: { runner: LessonRunner }) {
  const ctx = useCourse();
  const view = useStore(runner.store);
  const { state, lesson } = view;
  const isRemediation = view.isRemediation;

  if (view.inputMode === 'done') {
    const passed = Object.values(state.checkResults).filter((r) => r.rating >= 3).length;
    return (
      <Page width="sm" data-testid="lesson-done">
        <PageHeader
          crumbs={[{ label: 'My courses', to: '/shelf' }, { label: ctx.course.title, to: '/today' }, { label: lesson.title }]}
          title={`${isRemediation ? 'Repair complete' : 'Lesson complete'}: ${lesson.title}`}
          description={`Unaided check passed on ${passed} of ${state.conceptIds.length} concept${state.conceptIds.length === 1 ? '' : 's'}. Their review cards are now active and will come due on Today.`}
        />
        <Card>
          <ul className="divide-y divide-hairline text-sm">
            {lesson.concepts.map((c) => {
              const r = state.checkResults[c.id];
              const ok = r && r.rating >= 3;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-green-fg' : r ? 'text-red-fg' : 'text-muted'}`}>
                    {ok ? <Icon name="check" size={14} /> : null}
                    {r ? (ok ? 'passed' : 'repair scheduled') : 'not checked'}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
            <Link to="/today"><Button data-testid="back-to-today">Back to Today</Button></Link>
            <Link to="/map"><Button variant="secondary">Course map</Button></Link>
          </div>
        </Card>
      </Page>
    );
  }

  const above = (
    <>
      <Explainer storageKey="lesson" title="How a lesson works" testId="lesson-explainer">
        <p>Each concept goes through six short steps: <strong>{PHASE_LABEL.PRIME}</strong> (a cold attempt), <strong>{PHASE_LABEL.PROBE}</strong>, <strong>{PHASE_LABEL.DEVELOP}</strong> (the tutor asks, hints only after you try), <strong>{PHASE_LABEL.CONSOLIDATE}</strong>, <strong>{PHASE_LABEL.EXTEND}</strong> (a new case) and <strong>{PHASE_LABEL.CHECK}</strong>, where the tutor goes silent and your answer is graded without help.</p>
        <p>The tutor never hands you the answer, and only the final check counts toward mastery.</p>
      </Explainer>
      {view.error ? <ErrorBanner title="The tutor call failed" message={view.error} onRetry={() => runner.retry()} retryLabel="Retry" /> : null}
      <div className="lg:hidden">
        <Disclosure summary={SIDE_PANEL_LABEL} testId="concept-context-mobile">
          <ConceptContext concept={view.concept} lesson={lesson} />
        </Disclosure>
      </div>
    </>
  );

  return (
    <Workspace data-testid="lesson-screen" aside={<ConceptContext concept={view.concept} lesson={lesson} />} asideLabel={SIDE_PANEL_LABEL} asideTestId="side-panel">
      <div className="shrink-0 border-b border-hairline px-4 pb-4 pt-4 md:px-8 md:pt-5">
        <LessonHeader view={view} />
      </div>
      {view.inputMode === 'summary' || view.inputMode === 'jol' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[680px] space-y-4 px-4 py-5 md:px-8">
            {above}
            <WrapPanel view={view} runner={runner} />
          </div>
        </div>
      ) : (
        <ChatPane view={view} runner={runner} above={above} />
      )}
    </Workspace>
  );
}

export { REMEDIATION_PREFIX };
