import type { Concept, Lesson } from '@epistemics/core';
import { Disclosure, Markdown } from '@epistemics/ui';

/**
 * Concept context for the learner: definition, objectives and examples. Never reference answers, never
 * the script's pretest/transfer references, never item references (DESIGN §7.3, "two attempts before reveal").
 * It sits behind a disclosure above the conversation, so the lesson stays one column.
 */
export function ConceptContext({ concept, lesson }: { concept: Concept | undefined; lesson: Lesson }) {
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-muted">
      {concept ? (
        <>
          <div>
            <div className="font-medium text-ink">{concept.name}</div>
            <Markdown className="reading-sm mt-1 text-ink">{concept.definition}</Markdown>
          </div>
          <div>
            <div className="font-medium text-ink">What you should be able to do</div>
            <ul className="mt-1 space-y-1">
              {concept.objectives.map((o) => (
                <li key={o.id} title={`Bloom level: ${o.bloom}`}>{o.text}</li>
              ))}
            </ul>
          </div>
          {concept.examples.length > 0 ? (
            <div className="space-y-3">
              <div className="font-medium text-ink">Examples</div>
              {concept.examples.map((e, i) => (
                <div key={i}>
                  <div className="font-medium text-ink">{e.title}{e.domain ? <span className="font-normal text-muted"> · {e.domain}</span> : null}</div>
                  <Markdown className="reading-sm mt-1 text-ink">{e.body}</Markdown>
                </div>
              ))}
            </div>
          ) : null}
          {concept.spans.length > 0 ? (
            <ul className="space-y-1">
              {concept.spans.map((s, i) => (
                <li key={i}>“{s.quote}”{s.page !== undefined ? ` (p. ${s.page})` : ''}{s.heading ? ` — ${s.heading}` : ''}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <ol className="space-y-1">
        {lesson.concepts.map((c, i) => (
          <li key={c.id} className={c.id === concept?.id ? 'font-medium text-ink' : undefined} aria-current={c.id === concept?.id ? 'true' : undefined}>
            {i + 1}. {c.name}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Label for the disclosure that holds the context above the conversation. */
export const SIDE_PANEL_LABEL = 'About this concept';

/** The same context, as the one disclosure the lesson column carries. */
export function ConceptDisclosure({ concept, lesson }: { concept: Concept | undefined; lesson: Lesson }) {
  return (
    <Disclosure summary={SIDE_PANEL_LABEL} testId="concept-context">
      <ConceptContext concept={concept} lesson={lesson} />
    </Disclosure>
  );
}
