import type { LessonPhase, Scaffolding } from '@epistemics/core';
import { MAX_HINT_LEVEL } from '@epistemics/core';
import { Back, Icon, Pill, TopBar } from '@epistemics/ui';
import { useCourse } from '../../lib/app-state.js';
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

const SCAFFOLDING_LABEL: Record<Scaffolding, { label: string; help: string }> = {
  novice: { label: 'Worked example first', help: 'You are new to this: the tutor shows a complete example before asking you to solve one.' },
  developing: { label: 'Problem first, early hints', help: 'You have some background: the tutor asks first and hints readily.' },
  advanced: { label: 'Hints withheld', help: 'You know the ground: the tutor withholds hints for two attempts.' },
};

const HINT_PHASES = new Set<LessonPhase>(['DEVELOP', 'EXTEND', 'REMEDIATE']);

export function LessonHeader({ view }: { view: LessonView }) {
  const ctx = useCourse();
  const { state, lesson, concept } = view;
  const plan = state.phasePlan;
  const current = state.phase;
  const idx = plan.indexOf(current);
  const wrapping = current === 'WRAP' || current === 'DONE';
  const hints = HINT_PHASES.has(current);
  const scaffold = SCAFFOLDING_LABEL[state.scaffolding];
  return (
    <header className="space-y-3" data-testid="lesson-header">
      <TopBar>
        <Back label="Today" to="/today" testId="lesson-back" />
      </TopBar>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{view.isRemediation ? 'Repair: ' : ''}{lesson.title}</h1>
        <span className="text-[13px] text-muted">Concept {Math.min(state.conceptIndex + 1, state.conceptIds.length)} of {state.conceptIds.length}{concept ? `: ${concept.name}` : ''}</span>
      </div>
      <ol className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-fill p-0.5" aria-label="Lesson phases" data-testid="phase-indicator" data-phase={current}>
        {plan.map((p, i) => {
          const done = wrapping || idx > i;
          const active = p === current;
          return (
            <li key={p} aria-current={active ? 'step' : undefined}>
              <span title={`${p}: ${PHASE_HELP[p]}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? 'bg-surface text-ink shadow-chip' : done ? 'text-green-fg' : 'text-muted'}`}>
                {done && !active ? <Icon name="check" size={11} /> : null}
                {PHASE_LABEL[p]}
              </span>
            </li>
          );
        })}
        {current === 'REMEDIATE' ? <li><Pill tone="warn" title="REMEDIATE">{PHASE_LABEL.REMEDIATE}</Pill></li> : null}
        {wrapping ? <li><Pill tone="accent" title="WRAP">{PHASE_LABEL.WRAP}</Pill></li> : null}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-muted">
        <p className="min-w-0 max-w-xl"><span className="font-medium text-ink">{PHASE_LABEL[current]}.</span> {PHASE_HELP[current]}</p>
        <span className="flex flex-wrap items-center gap-2" data-testid="hint-status">
          {hints ? (
            <>
              <Pill tone={state.hintLevel > 0 ? 'warn' : 'neutral'}>Hint {state.hintLevel} of {MAX_HINT_LEVEL}</Pill>
              <span>{state.hintLevel >= MAX_HINT_LEVEL ? 'last hint given; explain it and move on' : 'next hint after your next attempt'}</span>
            </>
          ) : (
            <span>No hints in this phase</span>
          )}
          <Pill tone="neutral" title={scaffold.help}>{scaffold.label}</Pill>
        </span>
      </div>
    </header>
  );
}
