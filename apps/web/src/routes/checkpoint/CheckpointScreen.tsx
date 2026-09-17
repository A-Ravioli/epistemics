import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Confidence } from '@epistemics/core';
import { Button, Card, ConfidenceButtons, ErrorBanner, Eyebrow, Markdown, Page, PageHeader, Pill, Progress, Skeleton, Spinner, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { CheckpointRunner } from '../../lib/services/checkpoint.js';
import { findConcept } from '../../lib/services/courses.js';

/** Distraction-free: no side panel, progress only (DESIGN §10.4). */
export function CheckpointScreen() {
  const { unitId = '' } = useParams();
  const ctx = useCourse();
  const [runner, setRunner] = useState<CheckpointRunner | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setError(undefined);
    CheckpointRunner.open(ctx, unitId)
      .then((r) => {
        setRunner(r);
        void r.start();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [ctx, unitId, attempt]);
  if (error) {
    return (
      <Page width="reading">
        <ErrorBanner title="Could not compose the checkpoint" message={error} onRetry={() => setAttempt((a) => a + 1)} />
        <Link to="/today" className="inline-block"><Button variant="secondary">Back to Today</Button></Link>
      </Page>
    );
  }
  if (!runner) {
    return (
      <Page width="reading" data-testid="checkpoint-loading">
        <Skeleton lines={1} label="Composing the checkpoint" />
        <Card><Skeleton lines={4} /></Card>
      </Page>
    );
  }
  return <CheckpointView runner={runner} />;
}

function CheckpointView({ runner }: { runner: CheckpointRunner }) {
  const ctx = useCourse();
  const v = useStore(runner.store);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setAnswer('');
    setConfidence(undefined);
    if (!v.busy) input.current?.focus();
  }, [v.item?.id, v.busy]);

  if (v.result) {
    const entries = Object.entries(v.result.perConcept);
    const passed = entries.filter(([, r]) => r.passed).length;
    return (
      <Page width="sm" data-testid="checkpoint-done">
        <PageHeader
          crumbs={[{ label: 'My courses', to: '/shelf' }, { label: ctx.course.title, to: '/today' }, { label: 'Checkpoint result' }]}
          title={v.unit.title}
          description={`${passed} of ${entries.length} concepts passed. A concept passes at 80% or more; each pass counts as one spaced retrieval, and each miss gets a short repair lesson before the next unit.`}
        />
        <Card>
          <ul className="divide-y divide-hairline text-sm">
            {entries.map(([id, r]) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate">{findConcept(ctx.curriculum, id)?.concept.name ?? id}</span>
                <Pill tone={r.passed ? 'good' : 'bad'}>{Math.round(r.score * 100)}%{r.passed ? ' · passed' : ' · repair queued'}</Pill>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-hairline pt-4"><Link to="/today" className="inline-block"><Button data-testid="checkpoint-back">Back to Today</Button></Link></div>
        </Card>
      </Page>
    );
  }

  const canSubmit = !v.busy && confidence !== undefined && answer.trim().length > 0;
  const blocker = v.busy ? 'Grading…' : answer.trim().length === 0 ? 'Write an answer' : confidence === undefined ? 'Pick how sure you are' : null;

  return (
    <Page width="reading" data-testid="checkpoint-screen">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <Eyebrow>Checkpoint · no tutor, no hints</Eyebrow>
            <h1 className="mt-1 type-title">{v.unit.title}</h1>
          </div>
          <span className="text-[13px] text-muted">Question {Math.min(v.index + 1, v.total)} of {v.total}</span>
        </div>
        <Progress value={v.index} max={v.total} label="Checkpoint progress" />
      </header>
      {v.error ? <ErrorBanner title="Grading failed" message={v.error} onRetry={() => runner.retry()} retryLabel="Retry" /> : null}
      {v.item ? (
        <Card className="space-y-4 p-5 sm:p-7">
          <Markdown className="reading text-ink">{v.item.prompt}</Markdown>
          <label htmlFor="checkpoint-answer" className="sr-only">Your answer</label>
          <textarea id="checkpoint-answer" ref={input} className={`${inputClass} min-h-28`} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={v.busy} placeholder="Your answer, unaided." data-testid="checkpoint-answer" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium">How sure are you?</span>
            <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={v.busy} hotkeys={false} />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <Button onClick={() => confidence && runner.submit(answer, confidence)} disabled={!canSubmit} title={blocker ?? undefined} data-testid="checkpoint-submit">Submit</Button>
            {v.busy ? <Spinner label="Grading blind" /> : blocker ? <span className="text-xs text-muted">{blocker} to submit.</span> : null}
            <Button variant="ghost" onClick={() => runner.finishEarly()} disabled={v.busy} title="Unanswered questions count as misses" className="ml-auto">Finish early</Button>
          </div>
        </Card>
      ) : <Spinner label="Loading the next question" />}
      <p className="text-xs text-muted">Feedback comes at the end. Each answer is graded blind against the item's rubric; unanswered questions count as misses.</p>
    </Page>
  );
}
