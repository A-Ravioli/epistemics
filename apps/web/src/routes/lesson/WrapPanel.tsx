import { useState } from 'react';
import { Button, Card, ChatBubble, Spinner, inputClass } from '@epistemics/ui';
import type { LessonRunner, LessonView } from '../../lib/services/lesson.js';

/** WRAP: 3-5 sentence summary (generation), tutor error check, then a delayed judgment of learning per concept. */
export function WrapPanel({ view, runner }: { view: LessonView; runner: LessonRunner }) {
  const [summary, setSummary] = useState('');
  const [jol, setJol] = useState<Record<string, number>>(() => Object.fromEntries(view.lesson.concepts.map((c) => [c.id, 0.5])));
  const busy = view.busy !== null || view.streaming !== null;
  const tutorCheck = view.messages.filter((m) => m.role === 'tutor' && m.phase === 'WRAP').pop();

  if (view.inputMode === 'summary') {
    return (
      <Card className="space-y-3" data-testid="wrap-summary">
        <h2 className="text-base font-semibold">Wrap-up: write a summary</h2>
        <p className="text-sm text-ink/70">Three to five sentences on what this lesson taught, in your own words. The tutor will check it for errors; it also feeds your learner model.</p>
        <textarea className={`${inputClass} min-h-32`} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={busy} data-testid="summary-input" />
        <Button onClick={() => runner.submitSummary(summary)} disabled={busy || summary.trim().length < 20} data-testid="submit-summary">Submit summary</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3" data-testid="wrap-jol">
      <h2 className="text-base font-semibold">Tutor's check of your summary</h2>
      {view.streaming !== null ? <ChatBubble role="tutor" streaming>{view.streaming}</ChatBubble> : tutorCheck ? <ChatBubble role="tutor">{tutorCheck.content}</ChatBubble> : <Spinner label="Checking your summary" />}
      <h3 className="text-sm font-semibold">Judgment of learning</h3>
      <p className="text-sm text-ink/70">Which of today's concepts will you still be able to explain in a week? Slide to your predicted chance.</p>
      <div className="space-y-2">
        {view.lesson.concepts.map((c) => (
          <label key={c.id} className="flex items-center gap-3 text-sm">
            <span className="w-48 truncate">{c.name}</span>
            <input type="range" min={0} max={100} value={Math.round((jol[c.id] ?? 0.5) * 100)} onChange={(e) => setJol({ ...jol, [c.id]: Number(e.target.value) / 100 })} className="flex-1 accent-accent" aria-label={`Predicted recall for ${c.name}`} />
            <span className="w-10 text-right tabular-nums">{Math.round((jol[c.id] ?? 0.5) * 100)}%</span>
          </label>
        ))}
      </div>
      <Button onClick={() => runner.submitJol(jol)} disabled={busy} data-testid="submit-jol">Finish lesson</Button>
    </Card>
  );
}
