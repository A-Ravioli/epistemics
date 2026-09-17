import type { Concept, Lesson, LessonPhase } from '@epistemics/core';
import { Disclosure, Markdown, Pill } from '@epistemics/ui';

/**
 * Phases the learner answers with no help. The engine is the source of truth for what "unaided" means:
 * in `core/session/lesson.ts` the PRIME pretest and the CHECK answer are the two attempts recorded with
 * `assisted: false`, and PROBE runs before any teaching has happened. DESIGN §7.3 and §10.4 ("Checkpoint:
 * distraction-free, no side panel") extend the same rule here: while the learner is being checked, the
 * panel must not hold the answer. Everything reappears in DEVELOP, where the tutor is teaching anyway.
 */
const CONCEALED = new Set<LessonPhase>(['PRIME', 'PROBE', 'CHECK']);

const CONCEAL_NOTE: Partial<Record<LessonPhase, string>> = {
  PRIME: 'Hidden for your first attempt: answer from what you already have. The definition, objectives and examples appear once the tutor starts teaching.',
  PROBE: 'Still hidden while you say what you already know. It comes back in the next step.',
  CHECK: 'Hidden for the unaided check. This answer is the one that counts toward mastery, so nothing here can help you with it.',
};

/**
 * Concept context for the learner: definition, objectives and examples. Never reference answers, never
 * the script's pretest/transfer references, never item references (DESIGN §7.3, "two attempts before reveal"),
 * and nothing at all during the phases in `CONCEALED`.
 */
export function ConceptContext({ concept, lesson, phase }: { concept: Concept | undefined; lesson: Lesson; phase: LessonPhase }) {
  const concealed = CONCEALED.has(phase);
  return (
    <div className="space-y-3">
      {concept ? (
        <>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Concept</div>
            <div className="text-base font-medium">{concept.name}</div>
            {concealed ? (
              <p className="mt-1 text-sm text-muted" data-testid="concept-concealed">{CONCEAL_NOTE[phase]}</p>
            ) : (
              <Markdown className="mt-1 text-sm text-ink/80">{concept.definition}</Markdown>
            )}
          </div>
          {concealed ? null : (
            <>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">What you should be able to do</div>
                <ul className="mt-1 space-y-1.5 text-sm">
                  {concept.objectives.map((o) => (
                    <li key={o.id} className="flex items-start gap-2"><Pill tone="neutral" title={`Bloom level: ${o.bloom}`}>{o.bloom}</Pill><span className="min-w-0">{o.text}</span></li>
                  ))}
                </ul>
              </div>
              {concept.examples.length > 0 ? (
                <Disclosure summary={`Examples (${concept.examples.length})`}>
                  <div className="space-y-2">
                    {concept.examples.map((e, i) => (
                      <div key={i}>
                        <div className="text-xs font-medium">{e.title}{e.domain ? <span className="text-muted"> · {e.domain}</span> : null}</div>
                        <Markdown className="text-sm">{e.body}</Markdown>
                      </div>
                    ))}
                  </div>
                </Disclosure>
              ) : null}
              {concept.spans.length > 0 ? (
                <Disclosure summary={`Source excerpts (${concept.spans.length})`}>
                  <ul className="space-y-1 text-xs text-muted">
                    {concept.spans.map((s, i) => (
                      <li key={i}>“{s.quote}”{s.page !== undefined ? ` (p. ${s.page})` : ''}{s.heading ? ` — ${s.heading}` : ''}</li>
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <div>
        <div className="text-xs uppercase tracking-wide text-muted">This lesson</div>
        <ol className="mt-1 space-y-0.5 text-sm">
          {lesson.concepts.map((c, i) => (
            <li key={c.id} className={c.id === concept?.id ? 'font-medium' : 'text-muted'} aria-current={c.id === concept?.id ? 'true' : undefined}>{i + 1}. {c.name}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function SidePanel({ concept, lesson, phase }: { concept: Concept | undefined; lesson: Lesson; phase: LessonPhase }) {
  return (
    <aside className="hidden w-72 shrink-0 lg:block" data-testid="side-panel" aria-label="About this concept">
      <ConceptContext concept={concept} lesson={lesson} phase={phase} />
    </aside>
  );
}
