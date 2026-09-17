import { useEffect, useRef, useState } from 'react';
import type { Confidence, LessonPhase } from '@epistemics/core';
import { Button, ChatBubble, ConfidenceButtons, Explainer, Kbd, Spinner, inputClass } from '@epistemics/ui';
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

export function ChatPane({ view, runner }: { view: LessonView; runner: LessonRunner }) {
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
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-line bg-mist/30">
      <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4" data-testid="chat-log" role="log" aria-live="polite" aria-label="Lesson conversation">
        {view.messages.map((m) => (
          <ChatBubble key={m.key} role={m.role} streaming={m.streaming} meta={m.role === 'tutor' && m.phase ? PHASE_LABEL[m.phase] : undefined}>
            {m.content}
          </ChatBubble>
        ))}
        {view.busy && view.streaming === null ? (
          <div className="my-2 flex justify-start"><Spinner label={BUSY_LABEL[view.busy]} /></div>
        ) : null}
        <div ref={bottom} />
      </div>
      <div className="space-y-2 border-t border-line bg-paper p-3">
        {needsConfidence ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-medium">How sure are you?</span>
              <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={disabled} hotkeys={false} />
            </div>
            <Explainer storageKey="confidence" title="Why say how sure you are?">
              <p>You commit before you find out. A lucky guess then does not count as knowing, and a confident miss gets extra attention: that is how the app tells the two apart.</p>
            </Explainer>
          </div>
        ) : null}
        <label htmlFor="lesson-input" className="sr-only">Your answer</label>
        <textarea
          id="lesson-input"
          ref={input}
          className={`${inputClass} min-h-20`}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id="lesson-input-help" className="text-[11px] text-muted">
            Answer the question above; this is not a chat. <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> sends.
            {sendBlocker && !disabled ? <span className="ml-1 text-amber-800 dark:text-amber-200" data-testid="send-blocker">{sendBlocker}.</span> : null}
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
  );
}
