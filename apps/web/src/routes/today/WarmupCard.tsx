import { useState } from 'react';
import { Banner, Button, Card, inputClass, Pill, Spinner } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { runWarmup, type WarmupOffer, type WarmupResultView } from '../../lib/services/warmup.js';

export function WarmupCard({ offer, onDone }: { offer: WarmupOffer; onDone: () => Promise<void> }) {
  const ctx = useCourse();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WarmupResultView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await runWarmup(ctx, offer.lesson, text));
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string) => offer.lesson.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <Card data-testid="warmup-card">
      <div className="flex items-start justify-between">
        <h2 className="text-sm font-semibold">Warm-up</h2>
        {!result ? <Button variant="ghost" onClick={() => setSkipped(true)}>Skip</Button> : null}
      </div>
      {result ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>Recalled: {result.reviewed.length ? result.reviewed.map((r) => <Pill key={r.conceptId} tone="good">{name(r.conceptId)}</Pill>) : <span className="text-ink/60">none</span>}</p>
          {result.partial.length ? <p>Partly: {result.partial.map((id) => <Pill key={id} tone="warn">{name(id)}</Pill>)}</p> : null}
          <p>Queued first: {result.queuedFirst.length ? result.queuedFirst.map((id) => <Pill key={id} tone="bad">{name(id)}</Pill>) : <span className="text-ink/60">nothing missed</span>}</p>
          <p className="text-xs text-ink/60">{result.reviewedCards} card(s) credited with a Good review.</p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink/70">{offer.prompt}</p>
          <textarea className={`${inputClass} mt-2 min-h-28`} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder="Everything you remember, in your own words" />
          {error ? <Banner tone="bad" className="mt-2">{error}</Banner> : null}
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={submit} disabled={busy || text.trim().length < 10}>Grade my recall</Button>
            {busy ? <Spinner label="Grading blind" /> : null}
          </div>
        </>
      )}
    </Card>
  );
}
