import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Banner, Button, Disclosure, ErrorBanner, InspectorSection, NoteCard, PaneButton, PaneMenu, Page, Skeleton } from '@epistemics/ui';
import { useScreenChrome } from '../../app/chrome.js';
import { useApp, useCourse, useQuery } from '../../lib/app-state.js';
import { useMediaQuery, WIDE_QUERY } from '../../lib/use-media.js';
import { longDate, minutes, plural } from '../../lib/format.js';
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
  const wide = useMediaQuery(WIDE_QUERY);

  /*
   * The window's header and right panel. Today's name and date belong in the header row with the course
   * switcher, and the day's remaining facts belong in the inspector, where they sit beside the next step
   * instead of under it.
   */
  const t0 = q.data;
  useScreenChrome(() => {
    if (!t0) return {};
    const primary = primaryAction(t0);
    const lessonsTotal = ctx.curriculum.units.reduce((a, u) => a + u.lessons.length, 0);
    const done = t0.completedLessonIds.size;
    return {
      header: (
        <>
          <span className="truncate text-[14px] font-medium text-ink">Today</span>
          <span className="truncate text-[13px] text-muted">{ctx.course.title}</span>
        </>
      ),
      actions: (
        <>
          <PaneButton onClick={() => navigate('/map')}>Course map</PaneButton>
          <PaneMenu
            testId="today-menu"
            items={[
              { label: 'Progress', onSelect: () => navigate('/progress') },
              { label: 'Diagnostic', description: 'Place yourself in the curriculum', onSelect: () => navigate('/diagnostic') },
              { label: 'Course settings', onSelect: () => navigate('/settings') },
            ]}
          />
        </>
      ),
      // Below `lg` the inspector is not shown at all, and the same lines are rendered under the next step.
      inspector: wide ? [
        {
          id: 'agenda',
          label: 'Agenda',
          testId: 'inspector-agenda',
          render: () => <Agenda t={t0} primary={primary.key} lessonsTotal={lessonsTotal} />,
        },
        {
          id: 'course',
          label: 'Course',
          testId: 'inspector-course',
          render: () => (
            <>
              <InspectorSection title="Course">
                <p className="font-medium">{ctx.course.title}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {ctx.curriculum.units.length} units · {lessonsTotal} lessons · {done} done. Tutor scaffolding: {ctx.course.scaffolding}.
                </p>
              </InspectorSection>
              <InspectorSection title="Scheduling">
                <p className="text-[13px] leading-relaxed text-muted">
                  Target retention {(ctx.course.settings.desiredRetention * 100).toFixed(0)}% · at most {ctx.course.settings.reviewsPerDay} reviews and {ctx.course.settings.maxNewItemsPerDay} new cards a day · a study day starts at {ctx.course.settings.dayStartHour}:00 ({ctx.course.settings.timezone}).
                </p>
              </InspectorSection>
              <InspectorSection title="Units">
                <ol className="space-y-1 text-[13px] text-muted">
                  {[...ctx.curriculum.units].sort((a, b) => a.ordinal - b.ordinal).map((u) => (
                    <li key={u.id} className="truncate" title={u.title}>{u.title}</li>
                  ))}
                </ol>
              </InspectorSection>
            </>
          ),
        },
      ] : undefined,
    };
  }, [t0, wide, ctx.course, ctx.curriculum, navigate, q.refresh]);

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
      <header>
        <h1 className="type-display">Today</h1>
        <p className="mt-1 text-[13px] text-muted">
          {ctx.course.title} · <time dateTime={t.day}>{longDate(t.day)}</time>
          {ahead.status ? (
            <span data-testid="unit-build-pill" title={ahead.status.event ? describeEvent(ahead.status.event) : undefined}> · preparing unit {unitIndex + 1}: {ahead.status.unitTitle}…</span>
          ) : null}
        </p>
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

      {/* Everything else is a quiet line, not a panel: the same facts, none of them shouting. On a wide
          window those lines are the inspector's Agenda tab instead, so they are never said twice. */}
      {wide ? null : <Ledger t={t} primary={primary.key} lessonIsNext={lessonIsNext} lessonsTotal={lessonsTotal} onRefresh={q.refresh} />}
    </Page>
  );
}

/**
 * The same facts as the ledger, as the cards the inspector is made of: one per thing waiting on the
 * learner, in the order Today would offer them, and the tally at the bottom.
 */
function Agenda({ t, primary, lessonsTotal }: { t: TodayModel; primary: PrimaryKey; lessonsTotal: number }) {
  const navigate = useNavigate();
  const { llm } = useApp();
  const q = t.queue.queue;
  const due = t.queue.order.length;
  const cards: { key: PrimaryKey | 'sofar' | 'tutor'; title: string; time?: string; body: React.ReactNode; to?: string; testId?: string }[] = [];
  cards.push({
    key: 'review',
    title: 'Reviews',
    testId: 'review-card',
    time: due > 0 ? minutes(t.queue.minutes) : undefined,
    to: due > 0 ? '/review' : undefined,
    body: (
      <span data-testid="review-summary">
        {due > 0
          ? `${plural(due, 'card')} due — ${q.learning.length} still being learned, ${q.reviews.length} to refresh.${q.debt > 0 ? ` ${plural(q.debt, 'card')} of debt beyond today's cap.` : ''}`
          : q.dueToday === 0
            ? 'Nothing due. The lesson gate is open.'
            : `${plural(q.dueToday, 'card')} due; the rest are held back until tomorrow.`}
      </span>
    ),
  });
  // The next step already says which lesson is next when it is the primary action; never say it twice.
  if (t.nextLesson && primary !== 'lesson') {
    cards.push({
      key: 'lesson',
      title: 'Next lesson',
      testId: 'lesson-card',
      to: t.lessonLocked ? undefined : `/lesson/${t.nextLesson.id}`,
      body: (
        <>
          <span className="font-medium">{t.nextLesson.title}</span> — {plural(t.nextLesson.concepts.length, 'concept')}.{' '}
          {t.lessonLocked ? <span className="text-yellow-fg" data-testid="lock-reason">Locked: {t.lockReason}</span> : 'The gate is open.'}
        </>
      ),
    });
  }
  if (t.remediation.length) cards.push({ key: 'remediation', title: 'Repair', to: `/lesson/remediation:${t.remediation[0]!.conceptId}`, body: `${t.remediation.map((r) => r.name).join(', ')} — a short loop for concepts that did not pass.` });
  if (t.checkpoint) {
    cards.push({
      key: 'checkpoint',
      title: 'Checkpoint',
      testId: 'checkpoint-card',
      to: t.checkpoint.ready ? `/checkpoint/${t.checkpoint.unit.id}` : undefined,
      body: `${t.checkpoint.unit.title} — ${t.checkpoint.ready ? '8-15 questions without the tutor; feedback at the end.' : `not yet: ${t.checkpoint.reason}`}`,
    });
  }
  if (t.teachback.length) cards.push({ key: 'teachback', title: 'Teach back', to: `/teachback/${t.teachback[0]!.conceptId}`, body: `${t.teachback.map((c) => `${c.name} (${(c.mastery * 100).toFixed(0)}%)`).join(', ')} — explaining a half-known concept is the fastest way to finish it.` });
  // The same deferred tutor the ledger carries below `lg`; never both (DESIGN-SYSTEM §6).
  if (llm.mode === 'mock') {
    cards.push({
      key: 'tutor',
      title: 'Tutor',
      testId: 'tutor-line',
      to: '/settings',
      body: 'The demo stand-in — it cannot really teach. Pick a real one.',
    });
  }
  cards.push({
    key: 'sofar',
    title: 'So far',
    body: `${plural(t.streak, 'day')} in a row with every review cleared · ${t.completedLessonIds.size} of ${lessonsTotal} lessons done · ${plural(t.queue.cards.length, 'card')} in rotation.`,
  });

  return (
    <div data-testid="inspector-agenda-list">
      {cards.map((c) => (
        <NoteCard
          key={c.key}
          testId={c.testId}
          title={c.title}
          time={c.time}
          selected={c.key === primary}
          icon={c.key === 'sofar' ? 'chart' : c.key === 'tutor' ? 'spark' : 'check-square'}
          {...(c.to ? { onClick: () => navigate(c.to!) } : {})}
        >
          {c.body}
        </NoteCard>
      ))}
    </div>
  );
}

/** The day's remaining facts: reviews, the next lesson, repair, the checkpoint, teach-back, and the tally. */
function Ledger({ t, primary, lessonIsNext, lessonsTotal, onRefresh }: { t: TodayModel; primary: PrimaryKey; lessonIsNext: boolean; lessonsTotal: number; onRefresh: () => Promise<void> }) {
  return (
      <section className="space-y-3 text-[13px] leading-relaxed text-muted" data-testid="today-ledger">
        <ReviewLine t={t} primary={primary} />
        {lessonIsNext ? null : <LessonLine t={t} primary={primary} onOverride={onRefresh} />}
        {t.remediation.length > 0 ? (
          <Line label="Repair">
            {t.remediation.map((r) => r.name).join(', ')} — a short loop for concepts that did not pass.{' '}
            {primary !== 'remediation' ? <Link to={`/lesson/remediation:${t.remediation[0]!.conceptId}`} className="font-medium text-accent underline-offset-2 hover:underline">Start</Link> : null}
          </Line>
        ) : null}
        {t.checkpoint ? (
          <Line label="Checkpoint" testId="checkpoint-card">
            {t.checkpoint.unit.title} — {t.checkpoint.ready ? '8-15 questions without the tutor; feedback at the end.' : `not yet: ${t.checkpoint.reason} It opens once every concept in the unit has been recalled on two different days.`}{' '}
            {t.checkpoint.ready && primary !== 'checkpoint' ? <Link to={`/checkpoint/${t.checkpoint.unit.id}`} className="font-medium text-accent underline-offset-2 hover:underline">Start</Link> : null}
          </Line>
        ) : null}
        {t.teachback.length > 0 ? (
          <Line label="Teach back">
            {t.teachback.map((c) => `${c.name} (${(c.mastery * 100).toFixed(0)}%)`).join(', ')} — explaining a half-known concept is the fastest way to finish it.{' '}
            {primary !== 'teachback' ? <Link to={`/teachback/${t.teachback[0]!.conceptId}`} className="font-medium text-accent underline-offset-2 hover:underline">Teach</Link> : null}
          </Line>
        ) : null}
        <TutorLine />
        <Line label="So far">
          {plural(t.streak, 'day')} in a row with every review cleared · {t.completedLessonIds.size} of {lessonsTotal} lessons done · {plural(t.queue.cards.length, 'card')} in rotation
        </Line>
      </section>
  );
}

/**
 * The first run lets the tutor question be deferred (docs/ONBOARDING.md §6), so the deferral is carried
 * here rather than lost: the demo tutor works on every screen but cannot actually teach, and a learner
 * about to start a lesson is the one who needs told.
 */
function TutorLine() {
  const { llm } = useApp();
  if (llm.mode !== 'mock') return null;
  return (
    <Line label="Tutor" testId="tutor-line">
      The demo stand-in: every screen works, but it says the same thing in every phase and cannot really teach.{' '}
      <Link to="/settings" className="font-medium text-accent underline-offset-2 hover:underline" data-testid="tutor-line-settings">Pick a real one</Link>
    </Line>
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
