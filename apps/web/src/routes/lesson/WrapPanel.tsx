import { useState } from 'react';
import { Button, Card, ChatBubble, Spinner, inputClass } from '@epistemics/ui';
import type { LessonRunner, LessonView } from '../../lib/services/lesson.js';

const MIN_SUMMARY = 20;

/** WRAP: 3-5 sentence summary (generation), tutor error check, then a delayed judgment of learning per concept. */
export function WrapPanel({ view, runner }: { view: LessonView; runner: LessonRunner }) {
  const [summary, setSummary] = useState('');
  const [jol, setJol] = useState<Record<string, number>>(() => Object.fromEntries(view.lesson.concepts.map((c) => [c.id, 0.5])));
  const busy = view.busy !== null || view.streaming !== null;
  const tutorCheck = view.messages.filter((m) => m.role === 'tutor' && m.phase === 'WRAP').pop();
  const short = summary.trim().length < MIN_SUMMARY;

  if (view.inputMode === 'summary') {
    return (
      <Card className="space-y-3" data-testid="wrap-summary">
        <h2 className="text-base font-semibold">Wrap up: write a summary</h2>
        <p className="text-sm text-muted">Three to five sentences on what this lesson taught, in your own words and without looking anything up. The tutor checks it for errors.</p>
        <label htmlFor="summary-input" className="sr-only">Your summary</label>
        <textarea id="summary-input" className={`${inputClass} min-h-32`} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={busy} data-testid="summary-input" placeholder="What did this lesson teach, and why does it hold?" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => runner.submitSummary(summary)} disabled={busy || short} data-testid="submit-summary" title={short ? `Write at least ${MIN_SUMMARY} characters` : undefined}>Submit summary</Button>
          {short && summary.length > 0 ? <span className="text-xs text-muted">A little more: at least {MIN_SUMMARY} characters.</span> : null}
          {busy ? <Spinner label="Checking your summary" /> : null}
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3" data-testid="wrap-jol">
      <h2 className="text-base font-semibold">The tutor's check of your summary</h2>
      <div role="log" aria-live="polite">
        {view.streaming !== null ? <ChatBubble role="tutor" streaming>{view.streaming}</ChatBubble> : tutorCheck ? <ChatBubble role="tutor">{tutorCheck.content}</ChatBubble> : <Spinner label="Checking your summary" />}
      </div>
      <h3 className="text-base font-semibold">How well will it stick?</h3>
      <p className="text-sm text-muted">For each concept, how likely is it that you can still explain it in a week? Your guess is compared with what actually happens; that trains your sense of what you know.</p>
      <div className="space-y-2">
        {view.lesson.concepts.map((c) => (
          <label key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:flex-nowrap">
            <span className="w-full truncate sm:w-48">{c.name}</span>
            <input type="range" min={0} max={100} value={Math.round((jol[c.id] ?? 0.5) * 100)} onChange={(e) => setJol({ ...jol, [c.id]: Number(e.target.value) / 100 })} className="min-w-0 flex-1 accent-accent" aria-label={`Predicted recall for ${c.name}`} />
            <span className="w-10 text-right tabular-nums">{Math.round((jol[c.id] ?? 0.5) * 100)}%</span>
          </label>
        ))}
      </div>
      <Button onClick={() => runner.submitJol(jol)} disabled={busy} data-testid="submit-jol" title={busy ? 'Wait for the tutor to finish checking' : undefined}>Finish lesson</Button>
    </Card>
  );
}
