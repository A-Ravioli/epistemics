import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { adjustRatingForConfidence, isCorrect, type Card as CardT, type Confidence, type Item, type Rating } from '@epistemics/core';
import { createSession, endSession, getReceiptsForSession, setReceiptDisputed } from '@epistemics/db';
import { Back, Banner, Button, Card, ConfidenceButtons, EmptyState, ErrorBanner, Explainer, Eyebrow, IconButton, Kbd, Markdown, Page, PageHeader, PanelSection, Pill, Progress, RatingButtons, Skeleton, Spinner, Stepper, TopBar, Workspace, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { WIDE_QUERY, useMediaQuery } from '../../lib/use-media.js';
import { getQueueFirst, markDayCleared, setQueueFirst } from '../../lib/settings.js';
import { gradeAnswer, resolveGradeTarget, type Graded } from '../../lib/services/grading.js';
import { applyReview, loadQueue, todayKey, type LoadedQueue } from '../../lib/services/queue.js';
import { GradeReceipt } from './GradeReceipt.js';

const SELF_GRADED = new Set<Item['type']>(['recall', 'cloze', 'predict']);

const ITEM_TYPE_LABEL: Record<Item['type'], string> = {
  recall: 'Recall',
  cloze: 'Fill the gap',
  explain: 'Explain',
  apply: 'Apply',
  discriminate: 'Tell apart',
  map: 'Map from memory',
  teachback: 'Teach back',
  predict: 'Predict',
};
const CARD_STATE_LABEL = ['New', 'Learning', 'Review', 'Relearning'] as const;

type Step = 'answer' | 'confidence' | 'reveal' | 'grading' | 'graded';

interface Current {
  card: CardT;
  item: Item;
  startedAt: number;
}

export function ReviewScreen() {
  const ctx = useCourse();
  const navigate = useNavigate();
  const wide = useMediaQuery(WIDE_QUERY);
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
  const [loadError, setLoadError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const shown = useRef(new Set<string>());
  const startedAt = useRef(Date.now());
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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

  const boot = useCallback(async () => {
    setLoadError(undefined);
    try {
      sessionId.current ??= (await createSession(ctx.db, { courseId: ctx.course.id, type: 'review' }, ctx.now())).id;
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.course.id]);

  useEffect(() => {
    void boot();
  }, [boot]);

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
    setError(undefined);
    answerRef.current?.focus();
  }, [current?.card.id]);

  // Keyboard users: move focus with the step so the next control is one Tab away, never lost on `body`.
  useEffect(() => {
    if (step === 'confidence') confidenceRef.current?.querySelector('button')?.focus();
    else if (step === 'reveal' || step === 'graded') resultRef.current?.focus();
  }, [step]);

  const previews = useMemo(() => {
    if (!current) return undefined;
    const p = ctx.scheduler.previewRatings(current.card, ctx.now());
    const fmt = (c: CardT) => {
      const ms = c.due - ctx.now();
      if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
      if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
      return `${Math.round(ms / 86_400_000)} d`;
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

  const selfGradedNow = current ? SELF_GRADED.has(current.item.type) : false;
  const continueFromAnswer = useCallback(() => {
    if (!current) return;
    if (!selfGradedNow && answer.trim().length === 0) return;
    setStep('confidence');
  }, [current, selfGradedNow, answer]);

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
        continueFromAnswer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, current, step, confidence, graded, grade, rate, continueFromAnswer]);

  if (loadError) return <Page width="sm"><ErrorBanner title="Could not load the review queue" message={loadError} onRetry={boot} /></Page>;
  if (finished) {
    return (
      <Page width="sm">
        <PageHeader back={{ label: 'Today', to: '/today' }} title="Reviews cleared" />
        <EmptyState
          title="Reviews cleared"
          body={`${done} card${done === 1 ? '' : 's'} answered. Nothing more is due today, so the lesson gate is open.`}
          action={<Button onClick={() => navigate('/today')} data-testid="reviews-done-today">Back to Today</Button>}
          testId="reviews-cleared"
        />
      </Page>
    );
  }
  if (!loaded || !current) {
    return (
      <Page width="reading" data-testid="review-loading">
        <Skeleton lines={1} label="Loading the queue" />
        <Card><Skeleton lines={2} /></Card>
        <Card><Skeleton lines={3} /></Card>
      </Page>
    );
  }

  const selfGraded = SELF_GRADED.has(current.item.type);
  const total = order.length;
  const conceptName = ctx.curriculum.units.flatMap((u) => u.lessons).flatMap((l) => l.concepts).find((c) => c.id === current.item.conceptId)?.name;
  const stepIndex = step === 'answer' ? 0 : step === 'confidence' || step === 'grading' ? 1 : 2;
  const learning = current.card.state === 1 || current.card.state === 3;
  const receipt = step === 'graded' && graded ? <GradeReceipt graded={graded} rubric={current.item.rubric} /> : null;

  const aside = (
    <div>
      <PanelSection title="This card">
        <div className="text-[15px] font-semibold leading-snug">{conceptName}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone={learning ? 'accent' : 'neutral'} title="Learning cards repeat within the session; review cards come back after days">{CARD_STATE_LABEL[current.card.state] ?? 'Review'}</Pill>
          <Pill tone="neutral" title={`Item type: ${current.item.type}`}>{ITEM_TYPE_LABEL[current.item.type]}</Pill>
        </div>
      </PanelSection>
      {receipt ? <PanelSection title="Blind grade">{receipt}</PanelSection> : null}
      <PanelSection title="Keys">
        <ul className="space-y-1.5 text-[13px] text-muted">
          <li><Kbd>Space</Kbd> continues</li>
          <li><Kbd>1</Kbd>–<Kbd>3</Kbd> confidence</li>
          <li><Kbd>1</Kbd>–<Kbd>4</Kbd> rating</li>
          <li><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> continues from the answer box</li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted">Confidence is always asked before the answer is shown.</p>
      </PanelSection>
    </div>
  );

  return (
    <Workspace data-testid="review-screen" aside={aside} asideLabel="About this card">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] space-y-5 px-4 py-5 md:px-8 md:py-6">
          <header className="space-y-3">
            <TopBar actions={<IconButton icon="back" label="Stop and go to Today" onClick={() => navigate('/today')} data-testid="review-stop" />}>
              <Back label="Today" to="/today" />
            </TopBar>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-[13px] text-muted" data-testid="review-progress">{index + 1} of {total}{done ? ` · ${done} done` : ''}</span>
              <Stepper steps={['Answer', 'Confidence', selfGraded ? 'Reveal & rate' : 'Blind grade']} current={stepIndex} label="Review steps" />
            </div>
            <Progress value={index} max={total} label="Queue progress" />
          </header>

          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>{conceptName}</Eyebrow>
              <span className="flex gap-1.5 lg:hidden">
                <Pill tone={learning ? 'accent' : 'neutral'}>{CARD_STATE_LABEL[current.card.state] ?? 'Review'}</Pill>
                <Pill tone="neutral">{ITEM_TYPE_LABEL[current.item.type]}</Pill>
              </span>
            </div>
            <Markdown className="reading mt-3 text-ink">{current.item.prompt}</Markdown>
          </Card>

          {step === 'answer' ? (
            <Card className="space-y-3">
              <label htmlFor="review-answer" className="block text-[13px] font-medium">{selfGraded ? 'Recall the answer first; jot it down if it helps' : 'Your answer'}</label>
              <textarea
                id="review-answer"
                ref={answerRef}
                className={`${inputClass} min-h-24`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    continueFromAnswer();
                  }
                }}
                placeholder={selfGraded ? 'Optional notes; you rate yourself after the reveal' : 'Write your answer; it is graded blind against a rubric'}
                data-testid="review-answer"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={continueFromAnswer} disabled={!selfGraded && answer.trim().length === 0} data-testid="review-continue" title={!selfGraded && answer.trim().length === 0 ? 'Write an answer first' : undefined}>Continue</Button>
                <span className="text-xs text-muted"><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> continues</span>
              </div>
            </Card>
          ) : null}

          {step === 'confidence' || step === 'grading' ? (
            <Card className="space-y-3">
              <div className="text-[13px] font-medium">How sure are you?</div>
              <div ref={confidenceRef}>
                <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={step === 'grading'} />
              </div>
              <Explainer storageKey="confidence" title="Why say how sure you are?">
                <p>You commit before the reveal. A lucky guess then does not count as knowing, and a confident miss is asked again today: that is how the app tells the two apart.</p>
              </Explainer>
              {error ? <ErrorBanner title="Grading failed" message={error} onRetry={() => void grade()} /> : null}
              <div className="flex flex-wrap items-center gap-3">
                {selfGraded ? (
                  <Button onClick={() => setStep('reveal')} disabled={confidence === undefined} data-testid="show-answer" title={confidence === undefined ? 'Pick a confidence first' : undefined}>Show answer <Kbd>Space</Kbd></Button>
                ) : (
                  <Button onClick={() => grade()} disabled={confidence === undefined || step === 'grading'} data-testid="grade-answer" title={confidence === undefined ? 'Pick a confidence first' : undefined}>Grade my answer <Kbd>Space</Kbd></Button>
                )}
                {step === 'grading' ? <Spinner label="Grading blind against the rubric" /> : confidence === undefined ? <span className="text-xs text-muted">Pick a confidence to continue.</span> : null}
              </div>
            </Card>
          ) : null}

          {step === 'reveal' ? (
            <Card className="space-y-4 p-5 sm:p-7" data-testid="review-reveal">
              <div ref={resultRef} tabIndex={-1} className="focus:outline-none"><Eyebrow>Reference answer</Eyebrow></div>
              <Markdown className="reading text-ink">{current.item.reference.answer}</Markdown>
              {current.item.reference.notes ? <p className="text-xs text-muted">{current.item.reference.notes}</p> : null}
              {hyper ? <Banner tone="bad">Confident miss: this card is asked again later in this session.</Banner> : null}
              {error ? <ErrorBanner title="Could not save the rating" message={error} /> : null}
              <div className="border-t border-hairline pt-4">
                <div className="mb-2 text-[13px] font-medium">How did you do? The rating sets when you see this card next.</div>
                <RatingButtons onRate={(r) => rate(r)} disabled={busy} previews={previews} />
              </div>
            </Card>
          ) : null}

          {step === 'graded' && graded ? (
            <Card className="space-y-4" data-testid="review-graded">
              <div ref={resultRef} tabIndex={-1} className="focus:outline-none"><Eyebrow>Blind grade</Eyebrow></div>
              {wide ? (
                <p className="text-sm text-muted">Rated <span className="font-medium text-ink">{['', 'Again', 'Hard', 'Good', 'Easy'][graded.rating]}</span>. The criteria and feedback are in the panel on the right.</p>
              ) : (
                receipt
              )}
              {graded.disagreement ? <Banner tone="warn">The grader samples disagreed. Rate yourself against the criteria above instead.</Banner> : null}
              {hyper ? <Banner tone="bad">Confident miss: this card is asked again later in this session.</Banner> : null}
              {error ? <ErrorBanner title="Could not save the rating" message={error} /> : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <Button onClick={() => rate(graded.rating, { grade: graded })} disabled={busy} data-testid="accept-grade">Accept {['', 'Again', 'Hard', 'Good', 'Easy'][graded.rating]} <Kbd>Space</Kbd></Button>
                <Button variant="secondary" onClick={dispute} disabled={busy || (graded.grade.samples ?? 1) >= 3} title="Two more independent grades are taken and the majority decides. The dispute is logged.">Dispute the grade</Button>
                {graded.disagreement ? <RatingButtons onRate={(r) => rate(r, { grade: graded })} disabled={busy} hotkeys={false} /> : null}
              </div>
            </Card>
          ) : null}

          <p className="text-xs text-muted lg:hidden">Keys: <Kbd>Space</Kbd> continues, <Kbd>1</Kbd>–<Kbd>3</Kbd> confidence, <Kbd>1</Kbd>–<Kbd>4</Kbd> rating. Confidence is always asked before the answer is shown.</p>
        </div>
      </div>
    </Workspace>
  );
}
