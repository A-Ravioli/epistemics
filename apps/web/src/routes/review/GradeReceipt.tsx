import type { RubricCriterion } from '@epistemics/core';
import { Icon, Pill } from '@epistemics/ui';
import type { Graded } from '../../lib/services/grading.js';

const RATING = ['', 'Again', 'Hard', 'Good', 'Easy'] as const;

function confidenceWord(c: number): string {
  return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low';
}

/** Criterion-level feedback with the derived rating: the receipt the learner can audit and dispute. */
export function GradeReceipt({ graded, rubric }: { graded: Graded; rubric: RubricCriterion[] }) {
  const g = graded.grade;
  const text = (id: string) => rubric.find((c) => c.id === id)?.text ?? id;
  const met = g.criteria.filter((c) => c.met).length;
  return (
    <div className="space-y-3 text-sm" data-testid="grade-receipt">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={graded.rating >= 3 ? 'good' : graded.rating === 2 ? 'warn' : 'bad'}>{RATING[graded.rating]}</Pill>
        {graded.hypercorrection ? <Pill tone="bad" title="You were certain and wrong: this is asked again in this session">confident miss</Pill> : null}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {met} of {g.criteria.length} criteria met · score {Math.round(g.score * 100)}% · grader confidence {confidenceWord(g.confidence)}{g.samples && g.samples > 1 ? ` · ${g.samples} independent grades` : ''}
        {graded.rawRating !== graded.rating ? ` · would have been ${RATING[graded.rawRating]}; adjusted by your confidence` : ''}
      </p>
      <ul className="space-y-2">
        {g.criteria.map((c) => (
          <li key={c.id} className="flex gap-3 py-2.5">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${c.met ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg'}`} aria-label={c.met ? 'met' : 'not met'} role="img">
              <Icon name={c.met ? 'check' : 'x'} size={12} />
            </span>
            <span className="min-w-0 leading-snug">
              {text(c.id)}
              {c.evidence ? <span className="mt-0.5 block text-xs text-muted">from your answer: “{c.evidence}”</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="reading-sm text-ink">{g.feedback}</p>
      {g.misconceptionTags.length ? <p className="text-xs text-muted">Pattern noticed: {g.misconceptionTags.join(', ')}. Future hints target it.</p> : null}
    </div>
  );
}
