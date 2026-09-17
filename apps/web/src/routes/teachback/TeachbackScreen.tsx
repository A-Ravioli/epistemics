import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Back, Button, Card, ChatBubble, ErrorBanner, IconButton, Kbd, Page, SectionTitle, Skeleton, Spinner, TopBar } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
import { useStore } from '../../lib/store.js';
import { TeachbackRunner } from '../../lib/services/teachback.js';
import { GradeReceipt } from '../review/GradeReceipt.js';

const MAX_TURNS = 6;

export function TeachbackScreen() {
  const { conceptId = '' } = useParams();
  const ctx = useCourse();
  const [runner, setRunner] = useState<TeachbackRunner | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(undefined);
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
  }, [ctx, conceptId, attempt]);
  if (error) {
    return (
      <Page width="reading">
        <ErrorBanner title="Could not start the teach-back" message={error} onRetry={() => setAttempt((a) => a + 1)} />
        <Link to="/today" className="inline-block"><Button variant="secondary">Back to Today</Button></Link>
      </Page>
    );
  }
  if (!runner) {
    return (
      <Page width="reading" data-testid="teachback-loading">
        <Skeleton lines={2} label="Waking the student" />
        <Card><Skeleton lines={3} /></Card>
      </Page>
    );
  }
  return <TeachbackView runner={runner} />;
}

function TeachbackView({ runner }: { runner: TeachbackRunner }) {
  const ctx = useCourse();
  const navigate = useNavigate();
  const v = useStore(runner.store);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [v.state.turns.length, v.streaming]);
  const disabled = v.busy || v.done || v.state.grading;
  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);
  const rubric = v.concept.items.find((i) => i.type === 'teachback')?.rubric ?? v.concept.objectives.map((o) => ({ id: o.id, text: o.text }));

  const send = async (done = false) => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await runner.submit(t, done);
  };

  return (
    <Page width="reading" data-testid="teachback-screen">
      <TopBar actions={<IconButton icon="back" label="Back to Today" onClick={() => navigate('/today')} />}>
        <Back label="Today" to="/today" />
      </TopBar>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Teach it back: {v.concept.name}</h1>
        <span className="text-[13px] text-muted">Turn {v.state.learnerTurns} of {MAX_TURNS}</span>
      </header>
      <p className="text-sm leading-relaxed text-muted">You are the teacher. The student has read nothing: explain the concept, answer their questions and give an example. Your whole explanation is graded blind afterwards and counts as a review of this concept.</p>
      {v.error ? <ErrorBanner title="The student call failed" message={v.error} /> : null}
      <div className="border-t border-hairline pt-2" role="log" aria-live="polite" aria-label="Teach-back conversation">
        {v.state.turns.map((t, i) => <ChatBubble key={i} role={t.role === 'student' ? 'student' : 'learner'} meta={t.role === 'student' ? 'Student' : undefined}>{t.content}</ChatBubble>)}
        {v.streaming !== null ? <ChatBubble role="student" streaming meta="Student">{v.streaming}</ChatBubble> : v.busy && !v.done ? <Spinner label={v.state.grading ? 'Grading your explanation' : 'The student is thinking'} /> : null}
        <div ref={bottom} />
      </div>
      {v.done && v.grade ? (
        <Card className="space-y-4">
          <SectionTitle>Blind grade of your explanation</SectionTitle>
          <GradeReceipt graded={v.grade} rubric={rubric} />
          <Link to="/today" className="inline-block"><Button>Back to Today</Button></Link>
        </Card>
      ) : v.done ? (
        <Card className="space-y-3"><p className="text-sm">The session ended without an explanation, so nothing was graded.</p><Link to="/today" className="inline-block"><Button>Back to Today</Button></Link></Card>
      ) : (
        <div className="rounded-card border border-hairline bg-nested p-3 shadow-chip transition-[box-shadow,border-color] duration-150 ease-out focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <label htmlFor="teachback-input" className="sr-only">Your explanation</label>
          <textarea id="teachback-input" ref={input} className="min-h-24 w-full resize-y bg-transparent px-1 py-1 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60" value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} placeholder="Explain it to the student in plain words, then give an example" data-testid="teachback-input" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
            <span className="text-[11px] text-muted"><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> sends</span>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => runner.end()} disabled={disabled} title="End the conversation and grade what you have said so far">Stop and grade</Button>
              <Button variant="secondary" onClick={() => send(true)} disabled={disabled || !text.trim()} title="Send this message and go straight to grading">Send as final</Button>
              <Button onClick={() => send()} disabled={disabled || !text.trim()}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
