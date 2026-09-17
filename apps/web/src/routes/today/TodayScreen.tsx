import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Banner, Button, Card, Disclosure, ErrorBanner, IconButton, Meter, Page, PageHeader, Pill, SectionTitle, Skeleton, Stat, type PillTone } from '@epistemics/ui';
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

const PRIMARY_KIND: Record<PrimaryKey, { label: string; tone: PillTone }> = {
  resume: { label: 'Lesson in progress', tone: 'accent' },
  review: { label: 'Reviews', tone: 'accent' },
  lesson: { label: 'Lesson', tone: 'good' },
  remediation: { label: 'Repair', tone: 'warn' },
  checkpoint: { label: 'Checkpoint', tone: 'purple' },
  teachback: { label: 'Teach it back', tone: 'lime' },
  done: { label: 'Done for today', tone: 'neutral' },
};

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
      <Page data-testid="today-loading">
        <PageHeader title="Today" />
        <Card><Skeleton lines={3} label="Building today" /></Card>
        <Card><Skeleton lines={2} /></Card>
      </Page>
    );
  }
  const t = q.data;
  const primary = primaryAction(t);
  const unitIndex = ahead.status ? [...ctx.curriculum.units].sort((a, b) => a.ordinal - b.ordinal).findIndex((u) => u.ordinal === ahead.status!.unit) : -1;
  const lessonsTotal = ctx.curriculum.units.reduce((a, u) => a + u.lessons.length, 0);

  const kind = PRIMARY_KIND[primary.key];
  return (
    <Page data-testid="today-screen">
      <PageHeader
        title="Today"
        crumbs={[{ label: 'My courses', to: '/shelf' }, { label: ctx.course.title }, { label: 'Today' }]}
        actions={<IconButton icon="gear" label="Settings" onClick={() => navigate('/settings')} />}
        description={ctx.course.title}
        meta={
          <span className="flex flex-wrap items-center gap-3">
            <time dateTime={t.day}>{t.day}</time>
            {ahead.status ? (
              <Pill tone="accent" title={ahead.status.event ? describeEvent(ahead.status.event) : undefined}>
                <span data-testid="unit-build-pill" className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
                  Preparing unit {unitIndex + 1}: {ahead.status.unitTitle}…
                </span>
              </Pill>
            ) : null}
          </span>
        }
      />
      {ahead.error ? <Banner tone="warn">Could not prepare the next unit: {ahead.error}</Banner> : null}
      {notice ? <Banner tone="warn" data-testid="today-notice">{notice}</Banner> : null}

      <Card className="p-5 sm:p-8" data-testid="next-up">
        <div className="flex items-center justify-between gap-3">
          <Pill tone={kind.tone}>{kind.label}</Pill>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Next up</span>
        </div>
        <h2 className="mt-4 type-title sm:text-[24px]">{primary.title}</h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{primary.body}</p>
        <div className="mt-5">
          {primary.to && primary.label ? (
            <Link to={primary.to} className="inline-block w-full sm:w-auto"><Button size="lg" className="w-full sm:w-auto" data-testid={primary.testId}>{primary.label}</Button></Link>
          ) : (
            <Link to="/map" className="inline-block w-full sm:w-auto"><Button size="lg" variant="secondary" className="w-full sm:w-auto">Course map</Button></Link>
          )}
        </div>
      </Card>

      {t.warmup ? <WarmupCard offer={t.warmup} onDone={q.refresh} /> : null}
      <ReviewCard t={t} primary={primary.key} />
      <LessonCard t={t} primary={primary.key} onOverride={q.refresh} />
      {t.remediation.length > 0 ? (
        <ListCard title="Repair loops" body="Short lessons (work it out → say it in your own words → check) for concepts that did not pass.">
          {t.remediation.map((r) => (
            <li key={r.conceptId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <Link to={`/lesson/remediation:${r.conceptId}`}><Button variant="secondary" size="sm">Start</Button></Link>
            </li>
          ))}
        </ListCard>
      ) : null}
      {t.checkpoint ? (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="checkpoint-card">
          <div className="min-w-0">
            <SectionTitle>Checkpoint: {t.checkpoint.unit.title}</SectionTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.checkpoint.ready ? 'Ready. 8-15 questions without the tutor; feedback comes at the end.' : `Not yet: ${t.checkpoint.reason} It opens once every concept in the unit has been recalled on two different days.`}</p>
          </div>
          {t.checkpoint.ready ? (
            primary.key !== 'checkpoint' ? <Link to={`/checkpoint/${t.checkpoint.unit.id}`}><Button variant="secondary" size="sm">Start checkpoint</Button></Link> : <Pill tone="purple">Next up</Pill>
          ) : (
            <Pill tone="neutral">Locked</Pill>
          )}
        </Card>
      ) : null}
      {t.teachback.length > 0 ? (
        <ListCard title="Teach it back" body="Concepts you half know (60-85% mastery): explaining them to a curious student is the fastest way to finish the job.">
          {t.teachback.map((c) => (
            <li key={c.conceptId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{c.name} <span className="text-xs text-muted">mastery {(c.mastery * 100).toFixed(0)}%</span></span>
              <Link to={`/teachback/${c.conceptId}`}><Button variant="secondary" size="sm">Teach</Button></Link>
            </li>
          ))}
        </ListCard>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Streak" value={t.streak} hint="days in a row with every review cleared" tone={t.streak > 0 ? 'good' : 'neutral'} />
        <Stat label="Lessons done" value={t.completedLessonIds.size} hint={`of ${lessonsTotal} in this course`} />
        <Stat label="Active cards" value={t.queue.cards.length} hint="questions in your review rotation" />
      </div>
    </Page>
  );
}

function ListCard({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
      <ul className="mt-2 divide-y divide-hairline">{children}</ul>
    </Card>
  );
}

function ReviewCard({ t, primary }: { t: TodayModel; primary: PrimaryKey }) {
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
  return (
    <Card data-testid="review-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <SectionTitle>Review queue</SectionTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted" data-testid="review-summary">{summary}</p>
        </div>
        {total > 0 ? (
          primary !== 'review' ? <Link to="/review" className="shrink-0"><Button variant="secondary" size="sm" data-testid="start-reviews">Start reviews</Button></Link> : <Pill tone="accent">Next up</Pill>
        ) : (
          <Pill tone="good">Clear</Pill>
        )}
      </div>
      <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
        <Meter label="Done today" value={t.queue.reviewsDoneToday} max={t.queue.reviewsDoneToday + total} tone="accent" hint="answered so far / due today" />
        <Meter
          label="Review debt"
          value={q.debt}
          max={Math.max(q.debt, cap)}
          tone={q.recoveryMode ? 'bad' : q.debt > 0 ? 'warn' : 'good'}
          suffix={q.overdueDays > 0 ? `(${q.overdueDays}d old)` : undefined}
          hint={q.debt > 0 ? `Cards due beyond today's cap of ${cap}. Debt older than 3 days switches on recovery mode.` : `No backlog. Debt is what is due beyond today's cap of ${cap}.`}
        />
      </div>
      {q.recoveryMode ? <Banner tone="bad" className="mt-3">Recovery mode: sessions are capped and the shakiest cards come first. About {plural(q.daysToClear, 'day')} to clear; lessons are hidden until then.</Banner> : null}
    </Card>
  );
}

function LessonCard({ t, primary, onOverride }: { t: TodayModel; primary: PrimaryKey; onOverride: () => Promise<void> }) {
  const ctx = useCourse();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!t.nextLesson) {
    return (
      <Card data-testid="lesson-card">
        <SectionTitle>Next lesson</SectionTitle>
        <p className="mt-1 text-sm leading-relaxed text-muted">None available: every lesson is either complete or waiting on a prerequisite you have not mastered yet. Keep reviewing; the <Link to="/map" className="text-accent underline underline-offset-2">map</Link> shows what is blocking.</p>
      </Card>
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
    <Card data-testid="lesson-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <SectionTitle>Next lesson{t.nextUnit ? <span className="font-normal text-muted"> · {t.nextUnit.title}</span> : null}</SectionTitle>
          <div className="mt-1 text-[17px] leading-snug">{lesson.title}</div>
          <div className="mt-1 text-xs text-muted">{plural(lesson.concepts.length, 'concept')}: {lesson.concepts.map((c) => c.name).join(', ')}</div>
          {t.lessonLocked ? (
            <p className="mt-2 text-sm text-yellow-fg" data-testid="lock-reason">Locked: {t.lockReason}</p>
          ) : (
            <p className="mt-2 text-sm text-green-fg" data-testid="lesson-unlocked">Unlocked: reviews are clear and prerequisites are met.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {t.lessonLocked ? (
            <>
              <Pill tone="warn">Locked</Pill>
              {canOverride ? <Button variant="ghost" size="sm" onClick={override} disabled={busy} data-testid="gate-override">Override once today</Button> : t.overrideUsedToday ? <span className="text-xs text-muted">Override used today</span> : null}
            </>
          ) : primary !== 'lesson' ? (
            <Link to={`/lesson/${lesson.id}`}><Button variant="secondary" size="sm" data-testid="start-lesson">Start lesson</Button></Link>
          ) : (
            <Pill tone="accent">Next up</Pill>
          )}
        </div>
      </div>
      {error ? <ErrorBanner className="mt-3" message={error} onRetry={override} /> : null}
      {t.lessonLocked ? (
        <div className="mt-4">
          <Disclosure summary="Why reviews first?" testId="gate-explainer">
            <p>Memory fades on a schedule. Each card is due at the moment you are about to forget it, and answering it then is what makes it stick. New lessons add more cards, so the app asks you to clear what is due before adding to the pile.</p>
            <p className="mt-2">You can override the gate once a day (for example before a lecture on the topic). Overrides are logged on the Progress screen. There is no permanent off switch.</p>
          </Disclosure>
        </div>
      ) : null}
    </Card>
  );
}
