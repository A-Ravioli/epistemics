import { useEffect, useRef, useState } from 'react';
import type { Confidence } from '@epistemics/core';
import { Button, ChatBubble, ConfidenceButtons, Spinner, inputClass } from '@epistemics/ui';
import type { LessonRunner, LessonView } from '../../lib/services/lesson.js';

const BUSY_LABEL = { tutor: 'Tutor is writing', observer: 'Observing your turn', grading: 'Grading blind', saving: 'Saving' } as const;

export function ChatPane({ view, runner }: { view: LessonView; runner: LessonRunner }) {
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const needsConfidence = view.inputMode === 'answer_confidence';
  const disabled = view.busy !== null || view.streaming !== null;
  const canSend = !disabled && text.trim().length > 0 && (!needsConfidence || confidence !== undefined);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [view.messages.length, view.streaming]);

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled, view.state.phase]);

  const send = async () => {
    if (!canSend) return;
    const t = text;
    const c = confidence;
    setText('');
    setConfidence(undefined);
    await runner.submit(t, needsConfidence ? c : undefined);
  };

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-line bg-mist/30">
      <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="chat-log">
        {view.messages.map((m) => (
          <ChatBubble key={m.key} role={m.role} streaming={m.streaming} meta={m.role === 'tutor' ? m.phase : undefined}>
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink/60">Confidence before you find out:</span>
            <ConfidenceButtons value={confidence} onChange={setConfidence} disabled={disabled} hotkeys={false} />
          </div>
        ) : null}
        <textarea
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
          placeholder={disabled ? 'Wait for the tutor…' : view.state.phase === 'CHECK' ? 'Answer unaided; the tutor stays silent' : 'Your answer (Ctrl/Cmd+Enter to send)'}
          data-testid="lesson-input"
          aria-label="Your answer"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink/50">No free-form chat: answer the question above. {needsConfidence ? 'Confidence is required.' : ''}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => runner.giveUp()} disabled={disabled} data-testid="give-up" title="Costs the item a rating of Again where one is at stake">
              {view.state.phase === 'PRIME' || view.state.phase === 'CHECK' ? "I don't know" : 'I give up'}
            </Button>
            <Button onClick={send} disabled={!canSend} data-testid="send">Send</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
