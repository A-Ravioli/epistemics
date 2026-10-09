import { useNavigate } from 'react-router';
import type { LessonPhase, Scaffolding } from '@epistemics/core';
import { MAX_HINT_LEVEL } from '@epistemics/core';
import { IconButton } from '@epistemics/ui';
import type { LessonView } from '../../lib/services/lesson.js';

/** Plain-words name of each phase; the phase code stays in `data-phase` and tooltips for the curious. */
export const PHASE_LABEL: Record<LessonPhase, string> = {
  PRIME: 'Try it first',
  PROBE: 'What do you already know?',
  DEVELOP: 'Work it out',
  CONSOLIDATE: 'Say it in your own words',
  EXTEND: 'Stretch',
  CHECK: 'Check, no help',
  REMEDIATE: 'Repair, then check again',
  WRAP: 'Wrap up',
  DONE: 'Done',
};

export const PHASE_HELP: Record<LessonPhase, string> = {
  PRIME: 'A cold first attempt at the key question. No feedback yet; say how sure you are.',
  PROBE: 'Tell the tutor anything you already know that might bear on this.',
  DEVELOP: 'The tutor leads with questions. A hint comes only after each real attempt, never the answer.',
  CONSOLIDATE: 'State the principle yourself. It is graded blind against the objective.',
  EXTEND: 'The same idea in a new setting, an edge case, or a look-alike to tell apart.',
  CHECK: 'The tutor is silent. Your answer is graded without help; this is what counts as learned.',
  REMEDIATE: 'A short repair of what went wrong, then another unaided check.',
  WRAP: 'Summarise the lesson in your own words, then predict what you will still remember.',
  DONE: 'Lesson complete.',
};

const SCAFFOLDING_LABEL: Record<Scaffolding, string> = {
  novice: 'worked example first',
  developing: 'problem first, early hints',
  advanced: 'hints withheld',
};

const HINT_PHASES = new Set<LessonPhase>(['DEVELOP', 'EXTEND', 'REMEDIATE']);

/**
 * One line of chrome above the conversation: where you are and what this step is. The phase code stays in
 * `data-phase` for tests and tooltips; the learner reads the plain-words version.
 */
export function LessonHeader({ view }: { view: LessonView }) {
  const navigate = useNavigate();
  const { state, lesson, concept } = view;
  const current = state.phase;
  const hints = HINT_PHASES.has(current);
  return (
    <header className="flex items-start gap-3" data-testid="lesson-header">
      <IconButton icon="back" label="Back to Today" onClick={() => navigate('/today')} data-testid="lesson-back" className="-ml-2 mt-0.5" />
      <div className="min-w-0 flex-1">
        <h1 className="type-heading truncate">{view.isRemediation ? 'Repair: ' : ''}{lesson.title}</h1>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted" data-testid="phase-indicator" data-phase={current}>
          <span title={`${current}: ${PHASE_HELP[current]}`}>{PHASE_LABEL[current]}</span>
          {' · '}concept {Math.min(state.conceptIndex + 1, state.conceptIds.length)} of {state.conceptIds.length}{concept ? `, ${concept.name}` : ''}
          <span data-testid="hint-status">
            {hints ? ` · hint ${state.hintLevel} of ${MAX_HINT_LEVEL}` : ' · no hints in this step'}
            {` · ${SCAFFOLDING_LABEL[state.scaffolding]}`}
          </span>
        </p>
      </div>
    </header>
  );
}
