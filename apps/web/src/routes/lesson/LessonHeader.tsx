import type { LessonPhase } from '@epistemics/core';
import { Pill, Pips } from '@epistemics/ui';
import type { LessonView } from '../../lib/services/lesson.js';

const PHASE_HELP: Record<LessonPhase, string> = {
  PRIME: 'Pretest, cold. No feedback yet.',
  PROBE: 'What do you already know that bears on this?',
  DEVELOP: 'Guided discovery. Hints only after an attempt.',
  CONSOLIDATE: 'State the principle in your own words.',
  EXTEND: 'Transfer: a new surface for the same idea.',
  CHECK: 'Unaided. The tutor is silent until graded.',
  REMEDIATE: 'Targeted repair, then check again.',
  WRAP: 'Your summary and a judgment of learning.',
  DONE: 'Done.',
};

export function LessonHeader({ view }: { view: LessonView }) {
  const { state, lesson, concept } = view;
  const plan = state.phasePlan;
  const current = state.phase;
  return (
    <header className="space-y-2" data-testid="lesson-header">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">{lesson.title}</h1>
        <span className="text-xs text-ink/60">Concept {Math.min(state.conceptIndex + 1, state.conceptIds.length)} of {state.conceptIds.length}{concept ? `: ${concept.name}` : ''}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="list" aria-label="Phase" data-testid="phase-indicator" data-phase={current}>
        {plan.map((p, i) => {
          const idx = plan.indexOf(current);
          const done = idx > i || current === 'WRAP' || current === 'DONE';
          const active = p === current;
          return (
            <span key={p} role="listitem" className="flex items-center gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${active ? 'bg-ink text-paper' : done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-mist text-ink/60'}`}>{p}</span>
              {i < plan.length - 1 ? <span className="text-ink/30">→</span> : null}
            </span>
          );
        })}
        {current === 'REMEDIATE' ? <Pill tone="warn">REMEDIATE</Pill> : null}
        {current === 'WRAP' ? <Pill tone="accent">WRAP</Pill> : null}
        <span className="ml-auto flex items-center gap-2 text-xs text-ink/60">
          <span>Hints</span>
          <Pips value={state.hintLevel} />
          <span className="rounded bg-mist px-1.5 py-0.5">{state.scaffolding}</span>
        </span>
      </div>
      <p className="text-xs text-ink/60">{PHASE_HELP[current]}</p>
    </header>
  );
}
