import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { adjustRatingForConfidence, isCorrect, type Card as CardT, type Confidence, type Item, type Rating } from '@epistemics/core';
import { createSession, endSession, getReceiptsForSession, setReceiptDisputed } from '@epistemics/db';
import { Banner, Button, Card, ConfidenceButtons, EmptyState, Markdown, Pill, Progress, RatingButtons, Spinner, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { getQueueFirst, markDayCleared, setQueueFirst } from '../../lib/settings.js';
import { gradeAnswer, resolveGradeTarget, type Graded } from '../../lib/services/grading.js';
import { applyReview, loadQueue, todayKey, type LoadedQueue } from '../../lib/services/queue.js';
import { GradeReceipt } from './GradeReceipt.js';

const SELF_GRADED = new Set<Item['type']>(['recall', 'cloze', 'predict']);

type Step = 'answer' | 'confidence' | 'reveal' | 'grading' | 'graded';

interface Current {
  card: CardT;
  item: Item;
  startedAt: number;
}

export function ReviewScreen() {
  const ctx = useCourse();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<LoadedQueue | undefined>();
  const [order, setOrder] = useState<CardT[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [step, setStep] = useState<Step>('answer');
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const [graded, setGraded] = useState<Graded | undefined>();
  const [hyper, setHyper] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const shown = useRef(new Set<string>());
  const startedAt = useRef(Date.now());
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const first = await getQueueFirst(ctx.db, ctx.course.id);
    const q = await loadQueue(ctx, { recentlyShownConceptIds: shown.current, queueFirstConceptIds: first });
    setLoaded(q);
    setOrder(q.order);
    setIndex(0);
    if (q.order.length === 0) {
      shown.current = new Set();
      const again = await loadQueue(ctx, { queueFirstConceptIds: first });
      if (again.order.length === 0) {
        setFinished(true);
        await setQueueFirst(ctx.db, ctx.course.id, []); // warm-up misses have been served
        if (again.queue.dueToday === 0) await markDayCleared(ctx.db, ctx.course.id, todayKey(ctx));
        if (sessionId.current) await endSession(ctx.db, sessionId.current, { reviews: done }, ctx.now());
      } else {
        setLoaded(again);
        setOrder(again.order);
      }
    }
  }, [ctx, done]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      sessionId.current ??= (await createSession(ctx.db, { courseId: ctx.course.id, type: 'review' }, ctx.now())).id;
      if (!cancelled) await load();
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.course.id]);

  const current: Current | undefined = useMemo(() => {
    const card = order[index];
    const item = card ? loaded?.itemsByCard.get(card.id) : undefined;
    return card && item ? { card, item, startedAt: startedAt.current } : undefined;
  }, [order, index, loaded]);

  useEffect(() => {
    startedAt.current = Date.now();
    setStep('answer');
    setAnswer('');
    setConfidence(undefined);
    setGraded(undefined);
    setHyper(false);
    answerRef.current?.focus();
  }, [current?.card.id]);

  const previews = useMemo(() => {
    if (!current) return undefined;
    const p = ctx.scheduler.previewRatings(current.card, ctx.now());
    const fmt = (c: CardT) => {
      const ms = c.due - ctx.now();
      if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
      if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
      return `${Math.round(ms / 86_400_000)}d`;
    };
    return { 1: fmt(p[1].card), 2: fmt(p[2].card), 3: fmt(p[3].card), 4: fmt(p[4].card) } as Record<Rating, string>;
  }, [current, ctx]);

  const advance = useCallback(async (reask?: CardT) => {
    if (!current) return;
    shown.current.add(current.item.conceptId);
    setDone((d) => d + 1);
    const next = index + 1;
    if (reask) setOrder((o) => [...o, reask]);
    if (next < order.length || reask) {
      setIndex(next);
    } else {
      await load();
    }
  }, [current, index, order.length, load]);

  const rate = useCallback(async (rating: Rating, opts: { grade?: Graded; adjusted?: boolean } = {}) => {
    if (!current || !sessionId.current) return;
    setBusy(true);
    setError(undefined);
    try {
      const selfGraded = SELF_GRADED.has(current.item.type);
      let final = rating;
      let hypercorrection = false;
      if (selfGraded && confidence !== undefined) {
        const adj = adjustRatingForConfidence(rating, confidence, isCorrect(rating));
        final = adj.rating;
        hypercorrection = adj.hypercorrection;
      } else if (opts.grade) {
        hypercorrection = opts.grade.hypercorrection;
      }
      const res = await applyReview(ctx, {
        card: current.card,
        rating: final,
        source: 'review',
        assisted: false,
        confidence,
        durationMs: Date.now() - current.startedAt,
        receipt: { sessionId: sessionId.current, answer: answer || (selfGraded ? '(self-graded)' : ''), grade: opts.grade?.grade },
      });
      if (hypercorrection) {
        setHyper(true);
        await new Promise((r) => setTimeout(r, 1200));
        await advance(res.card);
      } else {
        await advance();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [current, confidence, answer, ctx, advance]);

  const grade = useCallback(async (samples?: number) => {
    if (!current || confidence === undefined) return;
    setStep('grading');
    setError(undefined);
    try {
      const target = resolveGradeTarget(ctx.curriculum, current.item.id, 'item');
      const g = await gradeAnswer(ctx.provider, target, answer.trim() || '(no answer)', { confidence, samples, metadata: { sessionId: sessionId.current, courseId: ctx.course.id } });
      setGraded(g);
      setStep('graded');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('confidence');
    }
  }, [current, confidence, answer, ctx]);

  const dispute = useCallback(async () => {
    if (!sessionId.current) return;
    // Log the dispute on the latest receipt of this session for the item, then re-grade with three samples.
    const receipts = await getReceiptsForSession(ctx.db, sessionId.current);
    const mine = receipts.filter((r) => r.itemId === current?.item.id).pop();
    if (mine) await setReceiptDisputed(ctx.db, mine.id, true);
    await grade(3);
  }, [ctx.db, current, grade]);

  // Keyboard shortcuts: 1-3 confidence, 1-4 rating, space = reveal / accept.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (busy || !current) return;
      const selfGraded = SELF_GRADED.has(current.item.type);
      if (step === 'confidence' && ['1', '2', '3'].includes(e.key)) {
        setConfidence(Number(e.key) as Confidence);
        e.preventDefault();
      } else if (step === 'confidence' && e.key === ' ' && confidence !== undefined) {
        e.preventDefault();
        if (selfGraded) setStep('reveal');
        else void grade();
      } else if (step === 'reveal' && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as Rating);
      } else if (step === 'graded' && graded && e.key === ' ') {
        e.preventDefault();
        void rate(graded.rating, { grade: graded });
      } else if (step === 'answer' && e.key === ' ') {
        e.preventDefault();
        setStep('confidence');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, current, step, confidence, graded, grade, rate]);

  if (error && !current) return <Banner tone="bad">{error}</Banner>;
  if (finished) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState title="Reviews cleared" body={`${done} card${done === 1 ? '' : 's'} answered. The lesson gate is open.`} action={<Button onClick={() => navigate('/today')}>Back to Today</Button>} />
      </div>
    );
  }
  if (!loaded || !current) return <Spinner label="Loading queue" />;

  const selfGraded = SELF_GRADED.has(current.item.type);
  const total = order.length;
  const isLearning = current.card.state === 1 || current.card.state === 3;

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="review-screen">
      <header className="space-y-2">
        <div className="flex items-center justify-between text-sm text-ink/70">
          <span data-testid="review-progress">{index + 1} of {total}{done ? ` · ${done} done` : ''}</span>
          <span className="flex items-center gap-2">
            <Pill tone={isLearning ? 'accent' : 'neutral'}>{isLearning ? 'learning' : current.card.state === 0 ? 'new' : 'review'}</Pill>
            <Pill tone="neutral">{current.item.type}</Pill>
            <Link to="/today" className="text-xs underline">Stop</Link>
          </span>
        </div>
        <Progress value={index} max={total} />
      </header>

      <Card>
        <div className="text-xs uppercase tracking-wide text-ink/50">{ctx.curriculum.units.flatMap((u) => u.lessons).flatMap((l) => l.concepts).find((c) => c.id === current.item.conceptId)?.name}</div>
        <Markdown className="mt-2 text-base">{current.item.prompt}</Markdown>
      </Card>

      {step === 'answer' ? (
        <Card className="space-y-3">
          <label className="block text-sm font-medium">{selfGraded ? 'Recall it silently or jot it down' : 'Your answer'}</label>
          <textarea ref={answerRef} className={`${inputClass} min-h-24`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={selfGraded ? 'Optional notes' : 'Write your answer'} data-testid="review-answer" />
          <Button onClick={() => setStep('confidence')} disabled={!selfGraded && answer.trim().length === 0} data-testid="review-continue">Continue to confidence</Button>
        </Card>
      ) : null}

      {step === 'confidence' || step === 'grading' ? (
        <Card className="space-y-3">
          <div className="text-sm font-medium">How confident are you?</div>
          <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={step === 'grading'} />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <div className="flex items-center gap-3">
            {selfGraded ? (
              <Button onClick={() => setStep('reveal')} disabled={confidence === undefined} data-testid="show-answer">Show answer</Button>
            ) : (
              <Button onClick={() => grade()} disabled={confidence === undefined || step === 'grading'} data-testid="grade-answer">Grade my answer</Button>
            )}
            {step === 'grading' ? <Spinner label="Grading blind" /> : null}
          </div>
        </Card>
      ) : null}

      {step === 'reveal' ? (
        <Card className="space-y-3" data-testid="review-reveal">
          <div className="text-xs uppercase tracking-wide text-ink/50">Reference</div>
          <Markdown>{current.item.reference.answer}</Markdown>
          {current.item.reference.notes ? <p className="text-xs text-ink/60">{current.item.reference.notes}</p> : null}
          {hyper ? <Banner tone="bad">High-confidence miss: this will be asked again this session.</Banner> : null}
          <RatingButtons onRate={(r) => rate(r)} disabled={busy} previews={previews} />
        </Card>
      ) : null}

      {step === 'graded' && graded ? (
        <Card className="space-y-3" data-testid="review-graded">
          <GradeReceipt graded={graded} rubric={current.item.rubric} />
          {graded.disagreement ? <Banner tone="warn">Grader samples disagreed; you may self-grade with the rubric instead.</Banner> : null}
          {hyper ? <Banner tone="bad">High-confidence miss: this will be asked again this session.</Banner> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => rate(graded.rating, { grade: graded })} disabled={busy} data-testid="accept-grade">Accept ({['', 'Again', 'Hard', 'Good', 'Easy'][graded.rating]})</Button>
            <Button variant="secondary" onClick={dispute} disabled={busy || (graded.grade.samples ?? 1) >= 3}>Dispute (re-grade with 3 samples)</Button>
            {graded.disagreement ? <RatingButtons onRate={(r) => rate(r, { grade: graded })} disabled={busy} hotkeys={false} /> : null}
          </div>
        </Card>
      ) : null}

      <p className="text-xs text-ink/50">Keys: space to continue, 1-3 confidence, 1-4 rating. Confidence is always asked before the reveal.</p>
    </div>
  );
}

