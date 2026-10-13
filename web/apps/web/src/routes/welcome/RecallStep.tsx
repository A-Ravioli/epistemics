import { useState } from 'react';
import type { Curriculum } from '@epistemics/core';
import { Button, ChoiceGroup, Disclosure, inputClass } from '@epistemics/ui';
import { conceptsNamed, shouldOfferPlacement, type OnboardingDraft } from '../../lib/onboarding.js';

/**
 * Step 2 (ONBOARDING §3), and the pivot of the whole flow: the learner retrieves before the app explains
 * anything. It is the same move as the daily warm-up, it produces the background the old interview asked
 * for as a self-rating, and it is what earns the placement offer.
 */
export function RecallStep({
  draft, patch, pack, onContinue, onSkip,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  /** The chosen pack, when there is one: the reflection is matched against its concepts. */
  pack?: Curriculum;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [reflecting, setReflecting] = useState(false);
  const subject = (draft.subject ?? 'this').trim();
  const recall = draft.recall ?? '';
  const named = pack ? conceptsNamed(pack, recall) : [];
  const offer = shouldOfferPlacement(recall, named);

  if (reflecting) {
    return (
      <div className="space-y-6" data-testid="step-reflection">
        <header>
          <h1 className="type-display">That was the whole idea</h1>
        </header>

        {/* Concept names are titles, so they are set as a line of their own rather than folded into a
            sentence, where their capitals would read as a mistake. */}
        <div className="space-y-2" data-testid="reflection">
          <p className="reading text-ink">
            {named.length
              ? `You already named ${named.length === 1 ? 'one of this course’s concepts' : `${named.length} of this course’s concepts`}. I will check ${named.length === 1 ? 'it' : 'them'} early rather than teach ${named.length === 1 ? 'it' : 'them'} from scratch.`
              : recall.trim()
                ? 'That goes to the tutor, so the first lessons start from what you wrote rather than from nothing.'
                : 'Nothing at all is a fine place to start, and the tutor will pitch the first lessons accordingly.'}
          </p>
          {named.length ? <p className="text-[15px] leading-relaxed text-muted">{named.join(' · ')}</p> : null}
        </div>

        <div className="space-y-3 text-[15px] leading-relaxed text-muted">
          <p>
            Trying to remember something before you are taught it is the thing that makes it stick — even when you get it wrong, and even
            when you come up blank. That is the move you just made, and it is the one this app is built out of.
          </p>
          <p>
            So every lesson starts with a question you cannot answer yet, the tutor gives hints rather than answers, and it ends by checking
            you with nothing on screen to help. After that the same material comes back, spaced out, until you keep it.
          </p>
          <Disclosure summary="Where this comes from" testId="recall-evidence">
            Retrieval practice beats re-reading by roughly half a standard deviation (Rowland 2014; Adesope 2017), and a failed attempt
            before instruction still helps (Kornell 2009). Free recall — writing down everything you remember — has the largest effect of
            the retrieval formats (Karpicke &amp; Blunt 2011), which is why the app asks for one at the start of most days too.
          </Disclosure>
        </div>

        {offer ? (
          <div className="space-y-2" data-testid="placement-offer">
            <p className="text-[15px] text-ink">You clearly know some of this already. Want to prove it and skip ahead?</p>
            <ChoiceGroup<'yes' | 'no'>
              label="Placement quiz"
              testId="placement-choice"
              value={draft.placement ? 'yes' : 'no'}
              onChange={(v) => patch({ placement: v === 'yes' })}
              options={[
                { value: 'yes', label: 'Start with a placement quiz', description: 'About five minutes. Concepts you can already do skip their lessons — but they still enter the review rotation and have to survive it.' },
                { value: 'no', label: 'Start at the beginning', description: 'Nothing is skipped. You can take the placement later from Today.' },
              ]}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onContinue} data-testid="onboarding-next">Continue</Button>
          <button type="button" onClick={() => setReflecting(false)} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="step-recall">
      <header>
        <h1 className="type-display">First, what do you already know?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Before anything is taught, and before you pick a tutor. A minute is plenty.
        </p>
      </header>

      <p className="reading text-ink">Write down everything that comes to mind about {subject}. Terms, half-memories, a rule you are not sure of.</p>

      <div className="space-y-2">
        <label className="sr-only" htmlFor="recall">What you already know about {subject}</label>
        <textarea
          id="recall"
          className={`${inputClass} min-h-40`}
          value={recall}
          onChange={(e) => patch({ recall: e.target.value })}
          placeholder="Whatever you can dredge up…"
          data-testid="recall-input"
          autoFocus
        />
        <p className="text-[13px] leading-relaxed text-muted">
          “Nothing at all” is a real answer, and a useful one — it tells the tutor where to start. Nobody grades this.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => setReflecting(true)} data-testid="onboarding-next">Done</Button>
        <button type="button" onClick={onSkip} className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline" data-testid="onboarding-skip">Skip this</button>
      </div>
    </div>
  );
}
