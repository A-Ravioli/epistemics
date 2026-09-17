import type { RubricCriterion } from '@epistemics/core';
import { Pill } from '@epistemics/ui';
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
    <div className="space-y-2 text-sm" data-testid="grade-receipt">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={graded.rating >= 3 ? 'good' : graded.rating === 2 ? 'warn' : 'bad'}>{RATING[graded.rating]}</Pill>
        <span className="text-xs text-muted">
          {met} of {g.criteria.length} criteria met · score {Math.round(g.score * 100)}% · grader confidence {confidenceWord(g.confidence)}{g.samples && g.samples > 1 ? ` · ${g.samples} independent grades` : ''}
        </span>
        {graded.hypercorrection ? <Pill tone="bad" title="You were certain and wrong: this is asked again in this session">confident miss</Pill> : null}
        {graded.rawRating !== graded.rating ? <span className="text-xs text-muted">(would have been {RATING[graded.rawRating]}; adjusted by your confidence)</span> : null}
      </div>
      <ul className="space-y-1">
        {g.criteria.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span className={`shrink-0 ${c.met ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`} aria-label={c.met ? 'met' : 'not met'}>{c.met ? '✓' : '✗'}</span>
            <span className="min-w-0">
              {text(c.id)}
              {c.evidence ? <span className="block text-xs text-muted">from your answer: “{c.evidence}”</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-ink/90">{g.feedback}</p>
      {g.misconceptionTags.length ? <p className="text-xs text-muted">Pattern noticed: {g.misconceptionTags.join(', ')}. Future hints target it.</p> : null}
    </div>
  );
}
