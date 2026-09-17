import type { Concept, Lesson, LessonPhase } from '@epistemics/core';
import { Disclosure, Markdown, PanelSection, Pill } from '@epistemics/ui';

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
 * and none of it at all during the phases in `CONCEALED`.
 */
export function ConceptContext({ concept, lesson, phase }: { concept: Concept | undefined; lesson: Lesson; phase: LessonPhase }) {
  const concealed = CONCEALED.has(phase);
  return (
    <div>
      {concept ? (
        <>
          <PanelSection title="Concept">
            <div className="text-[15px] font-semibold leading-snug">{concept.name}</div>
            {concealed ? (
              <p className="mt-1.5 text-sm leading-snug text-muted" data-testid="concept-concealed">{CONCEAL_NOTE[phase]}</p>
            ) : (
              <Markdown className="reading-sm mt-1.5 text-ink">{concept.definition}</Markdown>
            )}
          </PanelSection>
          {concealed ? null : (
          <>
          <PanelSection title="What you should be able to do">
            <ul className="space-y-2 text-sm">
              {concept.objectives.map((o) => (
                <li key={o.id} className="flex items-start gap-2"><Pill tone="purple" title={`Bloom level: ${o.bloom}`}>{o.bloom}</Pill><span className="min-w-0 leading-snug">{o.text}</span></li>
              ))}
            </ul>
          </PanelSection>
          {concept.examples.length > 0 ? (
            <PanelSection>
              <Disclosure summary={`Examples (${concept.examples.length})`}>
                <div className="space-y-3">
                  {concept.examples.map((e, i) => (
                    <div key={i}>
                      <div className="text-xs font-medium">{e.title}{e.domain ? <span className="text-muted"> · {e.domain}</span> : null}</div>
                      <Markdown className="reading-sm mt-1">{e.body}</Markdown>
                    </div>
                  ))}
                </div>
              </Disclosure>
            </PanelSection>
          ) : null}
          {concept.spans.length > 0 ? (
            <PanelSection>
              <Disclosure summary={`Source excerpts (${concept.spans.length})`}>
                <ul className="space-y-1.5 text-xs text-muted">
                  {concept.spans.map((s, i) => (
                    <li key={i}>“{s.quote}”{s.page !== undefined ? ` (p. ${s.page})` : ''}{s.heading ? ` — ${s.heading}` : ''}</li>
                  ))}
                </ul>
              </Disclosure>
            </PanelSection>
          ) : null}
          </>
          )}
        </>
      ) : null}
      <PanelSection title="This lesson">
        <ol className="space-y-1 text-sm">
          {lesson.concepts.map((c, i) => (
            <li key={c.id} className={`flex gap-2 ${c.id === concept?.id ? 'font-medium text-ink' : 'text-muted'}`} aria-current={c.id === concept?.id ? 'true' : undefined}>
              <span className="w-4 shrink-0 tabular-nums">{i + 1}.</span><span className="min-w-0">{c.name}</span>
            </li>
          ))}
        </ol>
      </PanelSection>
    </div>
  );
}

/** Kept for the disclosure on small screens; the right panel itself is rendered by `Workspace`. */
export const SIDE_PANEL_LABEL = 'About this concept';
