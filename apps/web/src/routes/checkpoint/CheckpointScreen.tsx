import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Confidence } from '@epistemics/core';
import { Banner, Button, Card, ConfidenceButtons, Markdown, Pill, Progress, Spinner, inputClass } from '@epistemics/ui';
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
  useEffect(() => {
    CheckpointRunner.open(ctx, unitId)
      .then((r) => {
        setRunner(r);
        void r.start();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [ctx, unitId]);
  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!runner) return <Spinner label="Composing the checkpoint" />;
  return <CheckpointView runner={runner} />;
}

function CheckpointView({ runner }: { runner: CheckpointRunner }) {
  const ctx = useCourse();
  const v = useStore(runner.store);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  useEffect(() => {
    setAnswer('');
    setConfidence(undefined);
  }, [v.item?.id]);

  if (v.result) {
    const entries = Object.entries(v.result.perConcept);
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="checkpoint-done">
        <Card>
          <h1 className="text-lg font-semibold">Checkpoint: {v.unit.title}</h1>
          <p className="mt-1 text-sm text-ink/70">{entries.filter(([, r]) => r.passed).length} of {entries.length} concepts passed (threshold 80%).</p>
          <ul className="mt-3 space-y-1 text-sm">
            {entries.map(([id, r]) => (
              <li key={id} className="flex items-center justify-between">
                <span>{findConcept(ctx.curriculum, id)?.concept.name ?? id}</span>
                <Pill tone={r.passed ? 'good' : 'bad'}>{Math.round(r.score * 100)}%{r.passed ? '' : ' · remediation queued'}</Pill>
              </li>
            ))}
          </ul>
          <Link to="/today" className="mt-4 inline-block"><Button>Back to Today</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="checkpoint-screen">
      <header className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Checkpoint: {v.unit.title}</span>
          <span className="text-ink/60">{Math.min(v.index + 1, v.total)} of {v.total}</span>
        </div>
        <Progress value={v.index} max={v.total} />
      </header>
      {v.error ? <Banner tone="bad" className="flex justify-between"><span>{v.error}</span><Button variant="secondary" onClick={() => runner.retry()}>Retry</Button></Banner> : null}
      {v.item ? (
        <Card className="space-y-3">
          <Markdown className="text-base">{v.item.prompt}</Markdown>
          <textarea className={`${inputClass} min-h-28`} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={v.busy} placeholder="Unaided. No tutor, no hints." data-testid="checkpoint-answer" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink/60">Confidence:</span>
            <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={v.busy} hotkeys={false} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => confidence && runner.submit(answer, confidence)} disabled={v.busy || confidence === undefined || answer.trim().length === 0}>Submit</Button>
            {v.busy ? <Spinner label="Grading blind" /> : null}
            <Button variant="ghost" onClick={() => runner.finishEarly()} disabled={v.busy}>Finish early</Button>
          </div>
        </Card>
      ) : <Spinner />}
      <p className="text-xs text-ink/50">Feedback comes at the end; each answer is graded blind against the item rubric.</p>
    </div>
  );
}
