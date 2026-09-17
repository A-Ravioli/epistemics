import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Confidence, LessonPhase } from '@epistemics/core';
import { Button, ChatBubble, ConfidenceButtons, Kbd, Spinner } from '@epistemics/ui';
import type { LessonRunner, LessonView } from '../../lib/services/lesson.js';
import { PHASE_LABEL } from './LessonHeader.js';

const BUSY_LABEL = { tutor: 'The tutor is writing…', observer: 'Reading your answer…', grading: 'Grading blind…', saving: 'Saving…' } as const;

const PLACEHOLDER: Record<LessonPhase, string> = {
  PRIME: 'Your best attempt, even a rough guess. Then say how sure you are.',
  PROBE: 'Anything you already know that might be related.',
  DEVELOP: 'Reason it out here. A hint follows each real attempt.',
  CONSOLIDATE: 'The principle, in your own words.',
  EXTEND: 'Apply the idea to this new case.',
  CHECK: 'Answer without help. The tutor stays silent until it is graded.',
  REMEDIATE: 'Try again with the correction in mind.',
  WRAP: 'Your summary.',
  DONE: '',
};

/**
 * The document-like reading column (scrolls) and the composer card pinned under it. `above` renders at the top
 * of the column, outside the live log: explainers, errors, the small-screen concept disclosure.
 */
export function ChatPane({ view, runner, above }: { view: LessonView; runner: LessonRunner; above?: ReactNode }) {
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const phase = view.state.phase;
  const needsConfidence = view.inputMode === 'answer_confidence';
  const disabled = view.busy !== null || view.streaming !== null;
  const hasText = text.trim().length > 0;
  const canSend = !disabled && hasText && (!needsConfidence || confidence !== undefined);
  const sendBlocker = disabled ? (view.busy ? BUSY_LABEL[view.busy] : 'Wait for the tutor') : !hasText ? 'Type an answer to send' : needsConfidence && confidence === undefined ? 'Pick how sure you are to send' : null;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [view.messages.length, view.streaming]);

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled, phase]);

  const send = async () => {
    if (!canSend) return;
    const t = text;
    const c = confidence;
    setText('');
    setConfidence(undefined);
    await runner.submit(t, needsConfidence ? c : undefined);
  };

  const unaided = phase === 'PRIME' || phase === 'CHECK';

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] space-y-4 px-4 py-5 md:px-8">
          {above}
          <div data-testid="chat-log" role="log" aria-live="polite" aria-label="Lesson conversation">
            {view.messages.map((m) => (
              <ChatBubble key={m.key} role={m.role} streaming={m.streaming} meta={m.role === 'tutor' && m.phase ? PHASE_LABEL[m.phase] : undefined}>
                {m.content}
              </ChatBubble>
            ))}
            {view.busy && view.streaming === null ? (
              <div className="my-3 flex justify-start"><Spinner label={BUSY_LABEL[view.busy]} /></div>
            ) : null}
            <div ref={bottom} />
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-hairline bg-surface px-4 py-3 md:px-8 md:py-4">
        <div className="mx-auto w-full max-w-[680px] space-y-3">
          <div className="rounded-card border border-hairline bg-nested p-3 shadow-chip transition-[box-shadow,border-color] duration-150 ease-out focus-within:border-accent/60 focus-within:shadow-lift">
            {needsConfidence ? (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[13px] font-medium" title="You commit before you find out: a lucky guess then does not count as knowing, and a confident miss gets extra attention.">How sure are you?</span>
                <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={disabled} hotkeys={false} />
              </div>
            ) : null}
            <label htmlFor="lesson-input" className="sr-only">Your answer</label>
            <textarea
              id="lesson-input"
              ref={input}
              className="min-h-20 w-full resize-y bg-transparent px-1 py-1 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={disabled}
              placeholder={disabled ? (view.busy ? BUSY_LABEL[view.busy] : 'Wait for the tutor…') : PLACEHOLDER[phase]}
              data-testid="lesson-input"
              aria-describedby="lesson-input-help"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
              <span id="lesson-input-help" className="text-[11px] text-muted">
                Answer the question above; this is not a chat. <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> sends.
                {sendBlocker && !disabled ? <span className="ml-1 text-yellow-fg" data-testid="send-blocker">{sendBlocker}.</span> : null}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => runner.giveUp()} disabled={disabled} data-testid="give-up" title={unaided ? 'Recorded as a miss; the tutor moves on' : 'Ends this step at the cost of a rating of Again'}>
                  {unaided ? "I don't know" : 'I give up'}
                </Button>
                <Button onClick={send} disabled={!canSend} data-testid="send" title={sendBlocker ?? 'Send your answer'}>Send</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
