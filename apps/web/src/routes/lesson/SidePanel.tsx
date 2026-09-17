import type { Concept, Lesson } from '@epistemics/core';
import { Disclosure, Markdown, Pill } from '@epistemics/ui';

/**
 * Concept context for the learner: definition, objectives and examples. Never reference answers, never
 * the script's pretest/transfer references, never item references (DESIGN §7.3, "two attempts before reveal").
 */
export function ConceptContext({ concept, lesson }: { concept: Concept | undefined; lesson: Lesson }) {
  return (
    <div className="space-y-3">
      {concept ? (
        <>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Concept</div>
            <div className="text-base font-medium">{concept.name}</div>
            <Markdown className="mt-1 text-sm text-ink/80">{concept.definition}</Markdown>
          </div>
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

export function SidePanel({ concept, lesson }: { concept: Concept | undefined; lesson: Lesson }) {
  return (
    <aside className="hidden w-72 shrink-0 lg:block" data-testid="side-panel" aria-label="About this concept">
      <ConceptContext concept={concept} lesson={lesson} />
    </aside>
  );
}
