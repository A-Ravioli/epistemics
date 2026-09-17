import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Confidence } from '@epistemics/core';
import { Button, Card, ConfidenceButtons, ErrorBanner, Markdown, Pill, Spinner, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { findConcept } from '../../lib/services/courses.js';
import { DiagnosticRunner } from '../../lib/services/diagnostic.js';

/** Adaptive placement (DESIGN §6.4). Distraction-free like the checkpoint. */
export function DiagnosticScreen() {
  const ctx = useCourse();
  const runner = useMemo(() => new DiagnosticRunner(ctx), [ctx]);
  const v = useStore(runner.store);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setAnswer('');
    setConfidence(undefined);
    if (!v.busy) input.current?.focus();
  }, [v.probe?.itemId, v.busy]);

  if (v.done) {
    return (
      <div className="mx-auto max-w-2xl" data-testid="diagnostic-done">
        <Card className="space-y-3">
          <h1 className="text-lg font-semibold">Placement complete</h1>
          <p className="text-sm text-muted">{v.knownConceptIds?.length ? `${v.knownConceptIds.length} concept${v.knownConceptIds.length === 1 ? '' : 's'} marked as provisionally known. They skip their lessons but still enter the review stream, so they must survive it.` : 'Nothing was marked as known: you start from the first lesson.'}</p>
          {v.knownConceptIds?.length ? <div className="flex flex-wrap gap-1">{v.knownConceptIds.map((id) => <Pill key={id} tone="good">{findConcept(ctx.curriculum, id)?.concept.name ?? id}</Pill>)}</div> : null}
          <Link to="/today"><Button>Go to Today</Button></Link>
        </Card>
      </div>
    );
  }

  const canSubmit = !v.busy && confidence !== undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="diagnostic-screen">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Placement: what do you already know?</h1>
        <span className="text-xs text-muted">Question {v.state.probes + 1} · level {v.probe?.depth ?? '-'} of {v.state.maxDepth}</span>
      </header>
      <p className="text-sm text-muted">One question per concept. A pass moves to a harder concept, a miss to an easier one, until the app finds where your knowledge ends (at most 25 questions). Answer without looking anything up; "I don't know" is a fine answer.</p>
      {v.error ? <ErrorBanner title="Grading failed" message={v.error} /> : null}
      {v.probe && v.item ? (
        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted">{findConcept(ctx.curriculum, v.probe.conceptId)?.concept.name}</div>
          <Markdown className="text-base">{v.item.prompt}</Markdown>
          <label htmlFor="diagnostic-answer" className="sr-only">Your answer</label>
          <textarea id="diagnostic-answer" ref={input} className={`${inputClass} min-h-24`} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={v.busy} data-testid="diagnostic-answer" placeholder="Your answer, or leave blank and press “I don't know”" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium">How sure are you?</span>
            <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={v.busy} hotkeys={false} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => confidence && runner.submit(answer, confidence)} disabled={!canSubmit} title={confidence === undefined ? 'Pick how sure you are first' : undefined}>Submit</Button>
            <Button variant="ghost" onClick={() => runner.submit("I don't know", 1)} disabled={v.busy}>I don't know</Button>
            {v.busy ? <Spinner label="Grading" /> : confidence === undefined ? <span className="text-xs text-muted">Pick a confidence to submit.</span> : null}
          </div>
          {v.lastGrade ? <p className="text-xs text-muted">Previous question: {v.lastGrade.rating >= 3 ? 'passed' : 'missed'}.</p> : null}
        </Card>
      ) : (
        <Card><Spinner label="Choosing the next question" /></Card>
      )}
      <Button variant="ghost" onClick={() => runner.skip()} disabled={v.busy} title="Start from the first lesson instead">Skip the diagnostic</Button>
    </div>
  );
}
