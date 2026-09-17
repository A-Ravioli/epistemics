import type { Concept, Lesson } from '@epistemics/core';
import { Disclosure, Markdown, PanelSection, Pill } from '@epistemics/ui';

/**
 * Concept context for the learner: definition, objectives and examples. Never reference answers, never
 * the script's pretest/transfer references, never item references (DESIGN §7.3, "two attempts before reveal").
 */
export function ConceptContext({ concept, lesson }: { concept: Concept | undefined; lesson: Lesson }) {
  return (
    <div>
      {concept ? (
        <>
          <PanelSection title="Concept">
            <div className="text-[15px] font-semibold leading-snug">{concept.name}</div>
            <Markdown className="reading-sm mt-1.5 text-ink">{concept.definition}</Markdown>
          </PanelSection>
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
