import type { CourseGoals } from '@epistemics/core';
import { Button, Disclosure, Field, SegmentedGroup, Spinner, inputClass } from '@epistemics/ui';
import { schedulingFor, type MinutesPerDay, type OnboardingDraft } from '../../lib/onboarding.js';

/**
 * Step 4 (ONBOARDING §3): the time the learner is willing to give, and the rule that time buys, on one
 * screen because they are the same subject. Minutes a day is the only scheduling question asked — the
 * review cap and the weekly budget are derived from it (§5), and retention is left alone.
 *
 * On the subject and material paths the curriculum is outlining in the background while this is on screen.
 */
export function CommitmentStep({
  draft, patch, building, onFinish, busy, finishLabel,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  /** Whether an outline is being generated behind this step, so the wait is accounted for. */
  building: boolean;
  onFinish: () => void;
  busy: boolean;
  finishLabel: string;
}) {
  const minutes = draft.minutesPerDay ?? 20;
  const { reviewsPerDay } = schedulingFor(minutes);

  return (
    <div className="space-y-6" data-testid="step-commitment">
      <header>
        <h1 className="type-display">How much time, most days?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Short and daily beats long and occasional, because the schedule is built out of days. This is the only scheduling
          question — everything else is worked out from it.
        </p>
      </header>

      <SegmentedGroup<MinutesPerDay>
        label="Minutes a day"
        testId="minutes-per-day"
        value={minutes}
        onChange={(m) => patch({ minutesPerDay: m })}
        options={[
          { value: 10, label: '10 min', sub: 'a coffee' },
          { value: 20, label: '20 min', sub: 'recommended' },
          { value: 40, label: '40 min', sub: 'serious' },
        ]}
      />

      {/* The rule, before it binds: the gate is the app's most distinctive behaviour and its main friction. */}
      <div className="space-y-3">
        <p className="reading text-ink" data-testid="gate-contract">
          Reviews come first. Each day Epistemics gives back what you are about to forget, and the next lesson stays locked
          until that is clear — about {minutes} minutes, at most {reviewsPerDay} cards.
        </p>
        <p className="text-[15px] leading-relaxed text-muted">
          You can override the gate once a day when life happens. There is no way to switch it off, because switching it off is
          what makes every other app not work.
        </p>
        <Disclosure summary="Why reviews first?" testId="gate-why">
          Spacing a review to just before you would have forgotten is what converts study time into memory (Cepeda 2006/2008), and the
          schedule only holds if the due cards are actually done. Letting new lessons jump the queue is how a backlog starts, and a
          backlog is what makes people quit. So the gate is enforced in code rather than recommended in prose: clear the day, then learn
          something new. Fall more than three days behind and the app switches to recovery mode and stops offering lessons at all until
          you are level.
        </Disclosure>
      </div>

      <div className="space-y-3">
        <Field label="Is there a deadline?" hint="An exam date caps review intervals so everything falls due before it.">
          <select
            className={inputClass}
            value={draft.purpose ?? 'understand'}
            onChange={(e) => patch({ purpose: e.target.value as CourseGoals['purpose'] })}
            data-testid="purpose"
          >
            <option value="understand">No — I want to understand it properly</option>
            <option value="apply">No — I want to apply it at work</option>
            <option value="exam">Yes — I have an exam</option>
          </select>
        </Field>
        {draft.purpose === 'exam' ? (
          <Field label="Exam date">
            <input type="date" className={inputClass} value={draft.examDate ?? ''} onChange={(e) => patch({ examDate: e.target.value })} data-testid="exam-date" />
          </Field>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onFinish} disabled={busy} data-testid="onboarding-finish">{finishLabel}</Button>
        {busy ? <Spinner label="Setting up your course" /> : building ? <span className="text-[13px] text-muted" data-testid="outlining-ahead">Sketching your curriculum while you read…</span> : null}
      </div>
    </div>
  );
}
