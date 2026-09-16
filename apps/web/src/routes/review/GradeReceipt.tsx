import type { RubricCriterion } from '@epistemics/core';
import { Pill } from '@epistemics/ui';
import type { Graded } from '../../lib/services/grading.js';

const RATING = ['', 'Again', 'Hard', 'Good', 'Easy'] as const;

/** Criterion-level feedback with the derived rating: the receipt the learner can audit and dispute. */
export function GradeReceipt({ graded, rubric }: { graded: Graded; rubric: RubricCriterion[] }) {
  const g = graded.grade;
  const text = (id: string) => rubric.find((c) => c.id === id)?.text ?? id;
  return (
    <div className="space-y-2 text-sm" data-testid="grade-receipt">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={graded.rating >= 3 ? 'good' : graded.rating === 2 ? 'warn' : 'bad'}>{RATING[graded.rating]}</Pill>
        <span className="text-xs text-ink/60">score {g.score.toFixed(2)} · grader confidence {g.confidence.toFixed(2)}{g.samples && g.samples > 1 ? ` · ${g.samples} samples` : ''}</span>
        {graded.hypercorrection ? <Pill tone="bad">hypercorrection</Pill> : null}
        {graded.rawRating !== graded.rating ? <span className="text-xs text-ink/60">(adjusted from {RATING[graded.rawRating]} by confidence)</span> : null}
      </div>
      <ul className="space-y-1">
        {g.criteria.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span className={c.met ? 'text-emerald-600' : 'text-rose-600'} aria-label={c.met ? 'met' : 'not met'}>{c.met ? '✓' : '✗'}</span>
            <span>
              {text(c.id)}
              {c.evidence ? <span className="block text-xs text-ink/60">“{c.evidence}”</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-ink/80">{g.feedback}</p>
      {g.misconceptionTags.length ? <p className="text-xs text-ink/60">Tagged: {g.misconceptionTags.join(', ')}</p> : null}
    </div>
  );
}
