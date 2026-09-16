import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Banner, Button, Card, ChatBubble, Spinner, inputClass } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { TeachbackRunner } from '../../lib/services/teachback.js';
import { GradeReceipt } from '../review/GradeReceipt.js';

export function TeachbackScreen() {
  const { conceptId = '' } = useParams();
  const ctx = useCourse();
  const [runner, setRunner] = useState<TeachbackRunner | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    TeachbackRunner.open(ctx, conceptId)
      .then((r) => {
        if (cancelled) return;
        setRunner(r);
        void r.start();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [ctx, conceptId]);
  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!runner) return <Spinner label="Waking the student" />;
  return <TeachbackView runner={runner} />;
}

function TeachbackView({ runner }: { runner: TeachbackRunner }) {
  const v = useStore(runner.store);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [v.state.turns.length, v.streaming]);
  const disabled = v.busy || v.done || v.state.grading;
  const rubric = v.concept.items.find((i) => i.type === 'teachback')?.rubric ?? v.concept.objectives.map((o) => ({ id: o.id, text: o.text }));

  const send = async (done = false) => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await runner.submit(t, done);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3" data-testid="teachback-screen">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Teach back: {v.concept.name}</h1>
        <span className="text-xs text-ink/60">turn {v.state.learnerTurns} of 6</span>
      </header>
      <p className="text-sm text-ink/70">The student has read nothing. Explain the concept; answer their questions; give an example. Your whole explanation is graded blind afterwards.</p>
      {v.error ? <Banner tone="bad">{v.error}</Banner> : null}
      <div className="rounded-lg border border-line bg-mist/30 px-4 py-3">
        {v.state.turns.map((t, i) => <ChatBubble key={i} role={t.role === 'student' ? 'student' : 'learner'}>{t.content}</ChatBubble>)}
        {v.streaming !== null ? <ChatBubble role="student" streaming>{v.streaming}</ChatBubble> : v.busy && !v.done ? <Spinner label={v.state.grading ? 'Grading your explanation' : 'Student is thinking'} /> : null}
        <div ref={bottom} />
      </div>
      {v.done && v.grade ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Blind grade of your explanation</h2>
          <GradeReceipt graded={v.grade} rubric={rubric} />
          <Link to="/today"><Button>Back to Today</Button></Link>
        </Card>
      ) : v.done ? (
        <Card><p className="text-sm">Session ended without an explanation.</p><Link to="/today"><Button className="mt-2">Back to Today</Button></Link></Card>
      ) : (
        <Card className="space-y-2">
          <textarea className={`${inputClass} min-h-24`} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} placeholder="Explain it to the student" data-testid="teachback-input" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => runner.end()} disabled={disabled}>Stop and grade</Button>
            <Button variant="secondary" onClick={() => send(true)} disabled={disabled || !text.trim()}>Send as final</Button>
            <Button onClick={() => send()} disabled={disabled || !text.trim()}>Send</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
