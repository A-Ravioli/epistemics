import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Confidence } from '@epistemics/core';
import { Banner, Button, Card, ConfidenceButtons, Markdown, Pill, Spinner, inputClass } from '@epistemics/ui';
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
  useEffect(() => {
    setAnswer('');
    setConfidence(undefined);
  }, [v.probe?.itemId]);

  if (v.done) {
    return (
      <div className="mx-auto max-w-2xl" data-testid="diagnostic-done">
        <Card className="space-y-3">
          <h1 className="text-lg font-semibold">Placement complete</h1>
          <p className="text-sm text-ink/70">{v.knownConceptIds?.length ? `${v.knownConceptIds.length} concept(s) seeded as provisionally known; they enter the review stream and must survive it.` : 'Nothing seeded: you start from the first lesson.'}</p>
          {v.knownConceptIds?.length ? <div className="flex flex-wrap gap-1">{v.knownConceptIds.map((id) => <Pill key={id} tone="good">{findConcept(ctx.curriculum, id)?.concept.name ?? id}</Pill>)}</div> : null}
          <Link to="/today"><Button>Go to Today</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="diagnostic-screen">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Placement diagnostic</h1>
        <span className="text-xs text-ink/60">probe {v.state.probes + 1} · depth {v.probe?.depth ?? '-'} of {v.state.maxDepth}</span>
      </header>
      <p className="text-sm text-ink/70">One question per concept, moving deeper on a pass and shallower on a fail. Stops when the frontier is bracketed or after 25 probes.</p>
      {v.error ? <Banner tone="bad">{v.error}</Banner> : null}
      {v.probe && v.item ? (
        <Card className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-ink/50">{findConcept(ctx.curriculum, v.probe.conceptId)?.concept.name}</div>
          <Markdown className="text-base">{v.item.prompt}</Markdown>
          <textarea className={`${inputClass} min-h-24`} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={v.busy} data-testid="diagnostic-answer" />
          <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={v.busy} hotkeys={false} />
          <div className="flex items-center gap-3">
            <Button onClick={() => confidence && runner.submit(answer, confidence)} disabled={v.busy || confidence === undefined}>Submit</Button>
            <Button variant="ghost" onClick={() => runner.submit("I don't know", 1)} disabled={v.busy}>I don't know</Button>
            {v.busy ? <Spinner label="Grading" /> : null}
          </div>
          {v.lastGrade ? <p className="text-xs text-ink/60">Previous probe: {v.lastGrade.rating >= 3 ? 'pass' : 'fail'}.</p> : null}
        </Card>
      ) : (
        <Card><p className="text-sm text-ink/70">No probe available.</p></Card>
      )}
      <Button variant="ghost" onClick={() => runner.skip()} disabled={v.busy}>Skip the diagnostic</Button>
    </div>
  );
}
