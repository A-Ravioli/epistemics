import { useState } from 'react';
import { Button, Card, ErrorBanner, Pill, SectionTitle, Spinner, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { runWarmup, type WarmupOffer, type WarmupResultView } from '../../lib/services/warmup.js';

const MIN_TEXT = 10;

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
  const short = text.trim().length < MIN_TEXT;

  return (
    <Card data-testid="warmup-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionTitle>Warm-up <span className="font-normal text-muted">· optional, 2-3 minutes</span></SectionTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">Whatever you remember counts as a review; whatever you miss goes first in today's queue.</p>
        </div>
        {!result ? <Button variant="ghost" size="sm" onClick={() => setSkipped(true)} title="Skip for today">Skip</Button> : null}
      </div>
      {result ? (
        <div className="mt-2 space-y-2 text-sm" aria-live="polite">
          <p>Recalled: {result.reviewed.length ? result.reviewed.map((r) => <Pill key={r.conceptId} tone="good">{name(r.conceptId)}</Pill>) : <span className="text-muted">none</span>}</p>
          {result.partial.length ? <p>Partly: {result.partial.map((id) => <Pill key={id} tone="warn">{name(id)}</Pill>)}</p> : null}
          <p>Going first in today's queue: {result.queuedFirst.length ? result.queuedFirst.map((id) => <Pill key={id} tone="bad">{name(id)}</Pill>) : <span className="text-muted">nothing missed</span>}</p>
          <p className="text-xs text-muted">{result.reviewedCards} card{result.reviewedCards === 1 ? '' : 's'} credited with a Good review.</p>
        </div>
      ) : (
        <>
          <p className="reading-sm mt-3 text-ink">{offer.prompt}</p>
          <label htmlFor="warmup-input" className="sr-only">Everything you remember</label>
          <textarea id="warmup-input" className={`${inputClass} mt-3 min-h-28`} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder="Everything you remember, in your own words. Order and polish do not matter." />
          {error ? <ErrorBanner className="mt-2" title="Grading failed" message={error} onRetry={submit} /> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={submit} disabled={busy || short} title={short ? 'Write a little more first' : undefined}>Grade my recall</Button>
            {busy ? <Spinner label="Grading blind" /> : null}
          </div>
        </>
      )}
    </Card>
  );
}
