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
  /**
   * Only for the two keys that have no card of their own. Every other key marks an existing card as next
   * up instead of restating it: the screen used to print the next action twice, once in a hero and again
   * in the card below it.
   */
  hero?: { title: string; body: string; to?: string; label?: string; testId?: string };
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
  if (t.openLesson) return { key: 'resume', hero: { title: `Resume: ${t.openLesson.title}`, body: 'You left a lesson part-way. Pick up where you stopped.', to: `/lesson/${t.openLesson.lessonId}`, label: 'Continue lesson', testId: 'continue-lesson' } };
  if (due > 0) return { key: 'review' };
  if (t.nextLesson && !t.lessonLocked) return { key: 'lesson' };
  if (t.remediation.length) return { key: 'remediation' };
  if (t.checkpoint?.ready) return { key: 'checkpoint' };
  if (t.teachback.length) return { key: 'teachback' };
  if (t.nextLesson && t.lessonLocked) return { key: 'done', hero: { title: 'Nothing more today', body: t.recoveryMode ? 'Recovery mode: the lesson stays hidden until the backlog clears.' : 'The next lesson is waiting on the review gate. Come back when reviews are due.' } };
  return { key: 'done', hero: { title: 'All clear', body: 'Every lesson is complete or waiting on a prerequisite. The map shows what is next.' } };
}

/** The header row that marks the single card holding the screen's only primary button. */
function NextUpHeader({ kind }: { kind: PrimaryKey }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <Pill tone={PRIMARY_KIND[kind].tone}>{PRIMARY_KIND[kind].label}</Pill>
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Next up</span>
    </div>
  );
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

      {primary.hero ? (
        <Card className="p-5 sm:p-7" data-testid="next-up">
          <div className="flex items-center justify-between gap-3">
            <Pill tone={PRIMARY_KIND[primary.key].tone}>{PRIMARY_KIND[primary.key].label}</Pill>
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Next up</span>
          </div>
          <h2 className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[24px]">{primary.hero.title}</h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{primary.hero.body}</p>
          <div className="mt-5">
            {primary.hero.to && primary.hero.label ? (
              <Link to={primary.hero.to} className="inline-block w-full sm:w-auto"><Button className="w-full sm:w-auto" data-testid={primary.hero.testId}>{primary.hero.label}</Button></Link>
            ) : (
              <Link to="/map" className="inline-block w-full sm:w-auto"><Button variant="secondary" className="w-full sm:w-auto">Course map</Button></Link>
            )}
          </div>
        </Card>
      ) : null}

      {t.warmup ? <WarmupCard offer={t.warmup} onDone={q.refresh} /> : null}
      {sections(t, primary.key, q.refresh).map((sec) => (
        <div key={sec.key} data-testid={sec.key === primary.key && !primary.hero ? 'next-up' : undefined}>{sec.node}</div>
      ))}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Streak" value={t.streak} hint="days in a row with every review cleared" tone={t.streak > 0 ? 'good' : 'neutral'} />
        <Stat label="Lessons done" value={t.completedLessonIds.size} hint={`of ${lessonsTotal} in this course`} />
        <Stat label="Active cards" value={t.queue.cards.length} hint="questions in your review rotation" />
      </div>
    </Page>
  );
}

/**
 * The day's cards in DESIGN §3.2 order, with the one that is next up hoisted to the top. Each card owns its
 * own copy and its own button; exactly one of them is marked `next` and carries the screen's only primary
 * button, so nothing on Today is stated twice.
 */
function sections(t: TodayModel, primary: PrimaryKey, refresh: () => Promise<void>): { key: PrimaryKey; node: ReactNode }[] {
  const all: { key: PrimaryKey; node: ReactNode }[] = [
    { key: 'review', node: <ReviewCard t={t} next={primary === 'review'} /> },
    { key: 'lesson', node: <LessonCard t={t} next={primary === 'lesson'} onOverride={refresh} /> },
  ];
  if (t.remediation.length > 0) {
    all.push({
      key: 'remediation',
      node: (
        <ListCard next={primary === 'remediation'} kind="remediation" title="Repair loops" body="Short lessons (work it out → say it in your own words → check) for concepts that did not pass.">
          {t.remediation.map((r, i) => (
            <li key={r.conceptId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <Link to={`/lesson/remediation:${r.conceptId}`}>
                <Button variant={primary === 'remediation' && i === 0 ? 'primary' : 'secondary'} size="sm" data-testid={i === 0 ? 'start-remediation' : undefined}>Start</Button>
              </Link>
            </li>
          ))}
        </ListCard>
      ),
    });
  }
  if (t.checkpoint) {
    const next = primary === 'checkpoint';
    all.push({
      key: 'checkpoint',
      node: (
        <Card data-testid="checkpoint-card">
          {next ? <NextUpHeader kind="checkpoint" /> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <SectionTitle>Checkpoint: {t.checkpoint.unit.title}</SectionTitle>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.checkpoint.ready ? 'Ready. 8-15 questions without the tutor; feedback comes at the end.' : `Not yet: ${t.checkpoint.reason} It opens once every concept in the unit has been recalled on two different days.`}</p>
            </div>
            {t.checkpoint.ready ? (
              <Link to={`/checkpoint/${t.checkpoint.unit.id}`} className="shrink-0"><Button variant={next ? 'primary' : 'secondary'} size={next ? 'md' : 'sm'} data-testid="start-checkpoint">Start checkpoint</Button></Link>
            ) : (
              <Pill tone="neutral">Locked</Pill>
            )}
          </div>
        </Card>
      ),
    });
  }
  if (t.teachback.length > 0) {
    all.push({
      key: 'teachback',
      node: (
        <ListCard next={primary === 'teachback'} kind="teachback" title="Teach it back" body="Concepts you half know (60-85% mastery): explaining them to a curious student is the fastest way to finish the job.">
          {t.teachback.map((c, i) => (
            <li key={c.conceptId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{c.name} <span className="text-xs text-muted">mastery {(c.mastery * 100).toFixed(0)}%</span></span>
              <Link to={`/teachback/${c.conceptId}`}>
                <Button variant={primary === 'teachback' && i === 0 ? 'primary' : 'secondary'} size="sm" data-testid={i === 0 ? 'start-teachback' : undefined}>Teach</Button>
              </Link>
            </li>
          ))}
        </ListCard>
      ),
    });
  }
  return [...all.filter((x) => x.key === primary), ...all.filter((x) => x.key !== primary)];
}

function ListCard({ title, body, children, next = false, kind }: { title: string; body: string; children: ReactNode; next?: boolean; kind: PrimaryKey }) {
  return (
    <Card>
      {next ? <NextUpHeader kind={kind} /> : null}
      <SectionTitle>{title}</SectionTitle>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
      <ul className="mt-2 divide-y divide-hairline">{children}</ul>
    </Card>
  );
}

function ReviewCard({ t, next }: { t: TodayModel; next: boolean }) {
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
      {next ? <NextUpHeader kind="review" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <SectionTitle>Review queue</SectionTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted" data-testid="review-summary">{summary}</p>
          {next ? <p className="mt-1 text-sm leading-relaxed text-muted">Reviews come first: clearing them is what unlocks the next lesson.</p> : null}
        </div>
        {total > 0 ? (
          <Link to="/review" className="shrink-0"><Button variant={next ? 'primary' : 'secondary'} size={next ? 'md' : 'sm'} data-testid="start-reviews">Start reviews</Button></Link>
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

function LessonCard({ t, next, onOverride }: { t: TodayModel; next: boolean; onOverride: () => Promise<void> }) {
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
      {next ? <NextUpHeader kind="lesson" /> : null}
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
          ) : (
            <Link to={`/lesson/${lesson.id}`}><Button variant={next ? 'primary' : 'secondary'} size={next ? 'md' : 'sm'} data-testid="start-lesson">Start lesson</Button></Link>
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
