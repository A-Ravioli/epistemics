import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Banner, Button, Disclosure, ErrorBanner, IconButton, Page, Skeleton } from '@epistemics/ui';
import { useApp, useCourse, useQuery } from '../../lib/app-state.js';
import { minutes, plural } from '../../lib/format.js';
import { setGateOverrideDay } from '../../lib/settings.js';
import { CurriculumBuilder, curriculumKey, unitBuilds, unitsToPrepare } from '../../lib/services/build.js';
import { loadToday, type TodayModel } from '../../lib/services/today.js';
import { useStore } from '../../lib/store.js';
import { describeEvent } from '../setup/BuildProgressView.js';
import { FirstRun } from './FirstRun.js';
import { WarmupCard } from './WarmupCard.js';

/**
 * Lazy generation (DESIGN §8.1 step 7): when the curriculum has unbuilt units within two of the learner's
 * current one, build them in the background and reload the course once they are saved.
 */
function useUnitsAhead(currentUnitOrdinal: number | undefined) {
  const app = useApp();
  const ctx = useCourse();
  const builds = useStore(unitBuilds);
  const [error, setError] = useState<string | undefined>();
  const status = builds[curriculumKey(ctx.course.curriculumId, ctx.course.curriculumVersion)];
  useEffect(() => {
    if (currentUnitOrdinal === undefined) return;
    if (!unitsToPrepare(ctx.curriculum, currentUnitOrdinal).length) return;
    const builder = new CurriculumBuilder(ctx.db, ctx.provider);
    builder
      .ensureUnitsAhead(ctx.course, currentUnitOrdinal)
      .then((built) => (built ? app.refreshCourses() : undefined))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [app, ctx, currentUnitOrdinal]);
  return { status, error };
}

type PrimaryKey = 'resume' | 'review' | 'lesson' | 'remediation' | 'checkpoint' | 'teachback' | 'done';

interface Primary {
  key: PrimaryKey;
  title: string;
  body: string;
  to?: string;
  label?: string;
  testId?: string;
}

/** The one thing to do next, in the order DESIGN §3.2 lists the day. */
function primaryAction(t: TodayModel): Primary {
  const due = t.queue.order.length;
  if (t.openLesson) return { key: 'resume', title: `Resume: ${t.openLesson.title}`, body: 'You left a lesson part-way. Pick up where you stopped.', to: `/lesson/${t.openLesson.lessonId}`, label: 'Continue lesson', testId: 'continue-lesson' };
  if (due > 0) return { key: 'review', title: `${plural(due, 'review')} due, about ${minutes(t.queue.minutes)}`, body: 'Reviews come first: clearing them is what unlocks the next lesson.', to: '/review', label: 'Start reviews', testId: 'start-reviews' };
  if (t.nextLesson && !t.lessonLocked) return { key: 'lesson', title: `Next lesson: ${t.nextLesson.title}`, body: `${plural(t.nextLesson.concepts.length, 'concept')}, taught by the tutor, then checked without help.`, to: `/lesson/${t.nextLesson.id}`, label: 'Start lesson', testId: 'start-lesson' };
  if (t.remediation.length) return { key: 'remediation', title: `Repair: ${t.remediation[0]!.name}`, body: 'A short loop for a concept that did not pass its check.', to: `/lesson/remediation:${t.remediation[0]!.conceptId}`, label: 'Start repair', testId: 'start-remediation' };
  if (t.checkpoint?.ready) return { key: 'checkpoint', title: `Checkpoint: ${t.checkpoint.unit.title}`, body: 'The unit is taught and reviewed. Prove it: 8-15 questions, no tutor, feedback at the end.', to: `/checkpoint/${t.checkpoint.unit.id}`, label: 'Start checkpoint', testId: 'start-checkpoint' };
  if (t.teachback.length) return { key: 'teachback', title: `Teach it back: ${t.teachback[0]!.name}`, body: 'Explain it to a curious student; it counts as a review.', to: `/teachback/${t.teachback[0]!.conceptId}`, label: 'Teach', testId: 'start-teachback' };
  if (t.nextLesson && t.lessonLocked) return { key: 'done', title: 'Nothing more today', body: t.recoveryMode ? 'Recovery mode: the lesson stays hidden until the backlog clears.' : 'The next lesson is waiting on the review gate. Come back when reviews are due.' };
  return { key: 'done', title: 'All clear', body: 'Every lesson is complete or waiting on a prerequisite. The map shows what is next.' };
}

export function TodayScreen() {
  const { ctx } = useApp();
  if (!ctx) return <FirstRun />;
  return <TodayBody />;
}

/** A line in the quiet ledger under the next step: a label, a sentence, and at most one small action. */
function Line({ label, children, action, testId }: { label: string; children: React.ReactNode; action?: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid={testId}>
      <span className="w-28 shrink-0 font-medium text-ink">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

function TodayBody() {
  const ctx = useCourse();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const q = useQuery(() => loadToday(ctx), [ctx.course.id, ctx.course.updatedAt, ctx.curriculum]);
  const ahead = useUnitsAhead(q.data?.currentUnitOrdinal);

  if (q.error) return <Page><ErrorBanner title="Could not load today" message={q.error} onRetry={q.refresh} /></Page>;
  if (!q.data) {
    return (
      <Page width="reading" data-testid="today-loading">
        <h1 className="type-display">Today</h1>
        <Skeleton lines={3} label="Building today" />
      </Page>
    );
  }
  const t = q.data;
  const primary = primaryAction(t);
  const lessonIsNext = primary.key === 'lesson';
  const unitIndex = ahead.status ? [...ctx.curriculum.units].sort((a, b) => a.ordinal - b.ordinal).findIndex((u) => u.ordinal === ahead.status!.unit) : -1;
  const lessonsTotal = ctx.curriculum.units.reduce((a, u) => a + u.lessons.length, 0);

  return (
    <Page width="reading" data-testid="today-screen">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-display">Today</h1>
          <p className="mt-1 text-[13px] text-muted">
            {ctx.course.title} · <time dateTime={t.day}>{t.day}</time>
            {ahead.status ? (
              <span data-testid="unit-build-pill" title={ahead.status.event ? describeEvent(ahead.status.event) : undefined}> · preparing unit {unitIndex + 1}: {ahead.status.unitTitle}…</span>
            ) : null}
          </p>
        </div>
        <IconButton icon="gear" label="Settings" onClick={() => navigate('/settings')} />
      </header>

      {ahead.error ? <Banner tone="warn">Could not prepare the next unit: {ahead.error}</Banner> : null}
      {notice ? <Banner tone="warn" data-testid="today-notice">{notice}</Banner> : null}

      {/* The next step, said once, the way the tutor would say it. */}
      <section className="space-y-4" data-testid="next-up">
        <div className="space-y-2" data-testid={lessonIsNext ? 'lesson-card' : undefined}>
          <p className="reading text-ink">{primary.title}</p>
          <p className="text-[15px] leading-relaxed text-muted">
            {lessonIsNext && t.nextLesson ? (
              <>
                {t.nextUnit ? <>{t.nextUnit.title} · </> : null}
                {plural(t.nextLesson.concepts.length, 'concept')}: {t.nextLesson.concepts.map((c) => c.name).join(', ')}. Taught by the tutor, then checked without help.{' '}
                <span data-testid="lesson-unlocked">The gate is open: reviews are clear and prerequisites are met.</span>
              </>
            ) : (
              primary.body
            )}
          </p>
        </div>
        {primary.to && primary.label ? (
          <Link to={primary.to} className="inline-block"><Button size="lg" data-testid={primary.testId}>{primary.label}</Button></Link>
        ) : (
          <Link to="/map" className="inline-block"><Button size="lg" variant="secondary">Course map</Button></Link>
        )}
      </section>

      {t.warmup ? <WarmupCard offer={t.warmup} onDone={q.refresh} /> : null}

      {/* Everything else is a quiet line, not a panel: the same facts, none of them shouting. */}
      <section className="space-y-3 text-[13px] leading-relaxed text-muted">
        <ReviewLine t={t} primary={primary.key} />
        {lessonIsNext ? null : <LessonLine t={t} primary={primary.key} onOverride={q.refresh} />}
        {t.remediation.length > 0 ? (
          <Line label="Repair">
            {t.remediation.map((r) => r.name).join(', ')} — a short loop for concepts that did not pass.{' '}
            {primary.key !== 'remediation' ? <Link to={`/lesson/remediation:${t.remediation[0]!.conceptId}`} className="font-medium text-accent underline-offset-2 hover:underline">Start</Link> : null}
          </Line>
        ) : null}
        {t.checkpoint ? (
          <Line label="Checkpoint" testId="checkpoint-card">
            {t.checkpoint.unit.title} — {t.checkpoint.ready ? '8-15 questions without the tutor; feedback at the end.' : `not yet: ${t.checkpoint.reason} It opens once every concept in the unit has been recalled on two different days.`}{' '}
            {t.checkpoint.ready && primary.key !== 'checkpoint' ? <Link to={`/checkpoint/${t.checkpoint.unit.id}`} className="font-medium text-accent underline-offset-2 hover:underline">Start</Link> : null}
          </Line>
        ) : null}
        {t.teachback.length > 0 ? (
          <Line label="Teach back">
            {t.teachback.map((c) => `${c.name} (${(c.mastery * 100).toFixed(0)}%)`).join(', ')} — explaining a half-known concept is the fastest way to finish it.{' '}
            {primary.key !== 'teachback' ? <Link to={`/teachback/${t.teachback[0]!.conceptId}`} className="font-medium text-accent underline-offset-2 hover:underline">Teach</Link> : null}
          </Line>
        ) : null}
        <Line label="So far">
          {plural(t.streak, 'day')} in a row with every review cleared · {t.completedLessonIds.size} of {lessonsTotal} lessons done · {plural(t.queue.cards.length, 'card')} in rotation
        </Line>
      </section>
    </Page>
  );
}

function ReviewLine({ t, primary }: { t: TodayModel; primary: PrimaryKey }) {
  const ctx = useCourse();
  const q = t.queue.queue;
  const total = t.queue.order.length;
  const cap = ctx.course.settings.reviewsPerDay;
  const summary =
    total === 0
      ? q.dueToday === 0
        ? 'Nothing due. The lesson gate is open.'
        : `${plural(q.dueToday, 'card')} due; the rest are held back (sibling cards of one you just saw, or beyond today's cap).`
      : `${plural(total, 'card')} due (${q.learning.length} still being learned, ${q.reviews.length} to refresh), about ${minutes(t.queue.minutes)}.`;
  const debt = q.debt > 0 ? ` ${plural(q.debt, 'card')} of debt beyond today's cap of ${cap}${q.overdueDays > 0 ? `, ${q.overdueDays} d old` : ''}.` : '';
  return (
    <>
      <Line
        label="Reviews"
        testId="review-card"
        action={total > 0 && primary !== 'review' ? <Link to="/review" className="font-medium text-accent underline-offset-2 hover:underline" data-testid="start-reviews">Start</Link> : null}
      >
        <span data-testid="review-summary">{summary}</span>
        {debt ? <span className={q.recoveryMode ? 'text-red-fg' : 'text-yellow-fg'}>{debt}</span> : null}
        {t.queue.reviewsDoneToday > 0 ? <span> {t.queue.reviewsDoneToday} done today.</span> : null}
      </Line>
      {q.recoveryMode ? (
        <p className="text-red-fg">Recovery mode: sessions are capped and the shakiest cards come first. About {plural(q.daysToClear, 'day')} to clear; lessons are hidden until then.</p>
      ) : null}
    </>
  );
}

function LessonLine({ t, primary, onOverride }: { t: TodayModel; primary: PrimaryKey; onOverride: () => Promise<void> }) {
  const ctx = useCourse();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!t.nextLesson) {
    return (
      <Line label="Next lesson" testId="lesson-card">
        None available: every lesson is either complete or waiting on a prerequisite. Keep reviewing; the <Link to="/map" className="text-accent underline underline-offset-2">map</Link> shows what is blocking.
      </Line>
    );
  }
  const lesson = t.nextLesson;
  const canOverride = t.lessonLocked && !t.recoveryMode && !t.overrideUsedToday;
  const override = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await setGateOverrideDay(ctx.db, ctx.course.id, t.day);
      await onOverride();
      navigate(`/lesson/${lesson.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Line
        label="Next lesson"
        testId="lesson-card"
        action={!t.lessonLocked && primary !== 'lesson' ? <Link to={`/lesson/${lesson.id}`} className="font-medium text-accent underline-offset-2 hover:underline" data-testid="start-lesson">Start</Link> : null}
      >
        <span className="text-ink">{lesson.title}</span>
        {t.nextUnit ? <span> · {t.nextUnit.title}</span> : null} — {plural(lesson.concepts.length, 'concept')}: {lesson.concepts.map((c) => c.name).join(', ')}.{' '}
        {t.lessonLocked ? (
          <span className="text-yellow-fg" data-testid="lock-reason">Locked: {t.lockReason}</span>
        ) : (
          <span className="text-green-fg" data-testid="lesson-unlocked">Unlocked: reviews are clear and prerequisites are met.</span>
        )}
      </Line>
      {error ? <ErrorBanner message={error} onRetry={override} /> : null}
      {t.lessonLocked ? (
        <div className="pl-0 sm:pl-[7.75rem]">
          <Disclosure summary="Why reviews first?" testId="gate-explainer">
            <p>Memory fades on a schedule. Each card is due at the moment you are about to forget it, and answering it then is what makes it stick. New lessons add more cards, so the app asks you to clear what is due before adding to the pile.</p>
            <p className="mt-2">You can override the gate once a day (for example before a lecture on the topic). Overrides are logged on the Progress screen. There is no permanent off switch.</p>
          </Disclosure>
          {canOverride ? (
            <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={override} disabled={busy} data-testid="gate-override">Override once today</Button>
          ) : t.overrideUsedToday ? (
            <span className="text-[13px] text-muted">Override used today.</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
