import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Banner, Button, Card, EmptyState, Meter, Pill, Spinner, Stat } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { minutes, plural } from '../../lib/format.js';
import { setGateOverrideDay } from '../../lib/settings.js';
import { loadToday, type TodayModel } from '../../lib/services/today.js';
import { WarmupCard } from './WarmupCard.js';

export function TodayScreen() {
  const ctx = useCourse();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const q = useQuery(() => loadToday(ctx), [ctx.course.id, ctx.course.updatedAt]);

  if (q.error) return <Banner tone="bad">{q.error}</Banner>;
  if (!q.data) return <Spinner label="Building today" />;
  const t = q.data;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <span className="text-sm text-ink/60">{t.day}</span>
      </header>
      {notice ? <Banner tone="warn" data-testid="today-notice">{notice}</Banner> : null}
      {t.openLesson ? (
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Resume: {t.openLesson.title}</div>
            <div className="text-xs text-ink/60">A lesson is in progress.</div>
          </div>
          <Link to={`/lesson/${t.openLesson.lessonId}`}><Button variant="secondary">Continue</Button></Link>
        </Card>
      ) : null}
      {t.warmup ? <WarmupCard offer={t.warmup} onDone={q.refresh} /> : null}
      <ReviewCard t={t} />
      <LessonCard t={t} onOverride={q.refresh} />
      {t.remediation.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold">Remediation</h2>
          <p className="mt-1 text-xs text-ink/60">Short DEVELOP → CONSOLIDATE → CHECK loops for concepts that did not pass.</p>
          <ul className="mt-2 space-y-1">
            {t.remediation.map((r) => (
              <li key={r.conceptId} className="flex items-center justify-between text-sm">
                <span>{r.name}</span>
                <Link to={`/lesson/remediation:${r.conceptId}`}><Button variant="secondary">Start</Button></Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {t.checkpoint ? (
        <Card className="flex items-center justify-between" data-testid="checkpoint-card">
          <div>
            <div className="text-sm font-medium">Checkpoint: {t.checkpoint.unit.title}</div>
            <div className="text-xs text-ink/60">{t.checkpoint.ready ? 'Unaided, blind-graded, no tutor. 8-15 items.' : t.checkpoint.reason}</div>
          </div>
          {t.checkpoint.ready ? <Link to={`/checkpoint/${t.checkpoint.unit.id}`}><Button>Start checkpoint</Button></Link> : <Pill tone="neutral">Not yet</Pill>}
        </Card>
      ) : null}
      {t.teachback.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold">Teach it back</h2>
          <p className="mt-1 text-xs text-ink/60">Concepts in the 0.6-0.85 mastery band: explain them to a curious student.</p>
          <ul className="mt-2 space-y-1">
            {t.teachback.map((c) => (
              <li key={c.conceptId} className="flex items-center justify-between text-sm">
                <span>{c.name} <span className="text-xs text-ink/50">mastery {(c.mastery * 100).toFixed(0)}%</span></span>
                <Link to={`/teachback/${c.conceptId}`}><Button variant="secondary">Teach</Button></Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Reviews-cleared streak" value={t.streak} hint="consecutive study days" tone={t.streak > 0 ? 'good' : 'neutral'} />
        <Stat label="Lessons done" value={t.completedLessonIds.size} hint={`of ${ctx.curriculum.units.reduce((a, u) => a + u.lessons.length, 0)}`} />
        <Stat label="Active cards" value={t.queue.cards.length} hint="in the review stream" />
      </div>
    </div>
  );
}

function ReviewCard({ t }: { t: TodayModel }) {
  const q = t.queue.queue;
  const total = t.queue.order.length;
  return (
    <Card data-testid="review-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Review queue</h2>
          <p className="mt-1 text-sm text-ink/70" data-testid="review-summary">
            {total === 0
              ? q.dueToday === 0
                ? 'Nothing due. The gate is open.'
                : `${plural(q.dueToday, 'card')} due; the rest are buried siblings or over the daily cap.`
              : `${plural(total, 'card')} due (${q.learning.length} learning, ${q.reviews.length} review), ~${minutes(t.queue.minutes)}.`}
          </p>
        </div>
        {total > 0 ? <Link to="/review"><Button data-testid="start-reviews">Start reviews</Button></Link> : <Pill tone="good">Clear</Pill>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Meter label="Done today" value={t.queue.reviewsDoneToday} max={t.queue.reviewsDoneToday + total} tone="accent" />
        <Meter label="Review debt" value={q.debt} max={Math.max(q.debt, ctxReviewsPerDay(t))} tone={q.recoveryMode ? 'bad' : q.debt > 0 ? 'warn' : 'good'} suffix={q.overdueDays > 0 ? `(${q.overdueDays}d old)` : undefined} />
      </div>
      {q.recoveryMode ? <Banner tone="bad" className="mt-3">Recovery mode: sessions are capped, lowest retrievability first. Projected {plural(q.daysToClear, 'day')} to clear.</Banner> : null}
    </Card>
  );
}

function ctxReviewsPerDay(t: TodayModel): number {
  return Math.max(1, t.queue.reviewsDoneToday + t.queue.order.length);
}

function LessonCard({ t, onOverride }: { t: TodayModel; onOverride: () => Promise<void> }) {
  const ctx = useCourse();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!t.nextLesson) {
    return <Card><EmptyState title="No lesson available" body="Every lesson is either complete or waiting on a prerequisite. Keep reviewing; the map shows what is blocking." /></Card>;
  }
  const lesson = t.nextLesson;
  const canOverride = t.lessonLocked && !t.recoveryMode && !t.overrideUsedToday;
  const override = async () => {
    setBusy(true);
    try {
      await setGateOverrideDay(ctx.db, ctx.course.id, t.day);
      await onOverride();
      navigate(`/lesson/${lesson.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card data-testid="lesson-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Next lesson{t.nextUnit ? ` · ${t.nextUnit.title}` : ''}</h2>
          <div className="mt-1 text-base">{lesson.title}</div>
          <div className="mt-1 text-xs text-ink/60">{plural(lesson.concepts.length, 'concept')}: {lesson.concepts.map((c) => c.name).join(', ')}</div>
          {t.lessonLocked ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" data-testid="lock-reason">Locked: {t.lockReason}</p> : <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300" data-testid="lesson-unlocked">Unlocked: reviews are clear and prerequisites are met.</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {t.lessonLocked ? (
            <>
              <Pill tone="warn">Locked</Pill>
              {canOverride ? <Button variant="ghost" onClick={override} disabled={busy}>Override once today</Button> : t.overrideUsedToday ? <span className="text-xs text-ink/50">Override used today</span> : null}
            </>
          ) : (
            <Link to={`/lesson/${lesson.id}`}><Button data-testid="start-lesson">Start lesson</Button></Link>
          )}
        </div>
      </div>
    </Card>
  );
}
