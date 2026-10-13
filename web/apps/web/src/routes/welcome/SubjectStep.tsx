import type { Curriculum } from '@epistemics/core';
import { Button, ChoiceGroup, Field, Icon, IconButton, Skeleton, Spinner, inputClass } from '@epistemics/ui';
import { plural } from '../../lib/format.js';
import { countConcepts } from '../../lib/services/packs.js';
import type { IngestedSource } from '../../lib/services/build.js';
import { DEFAULT_LEVEL, type OnboardingDraft, type OnboardingSource } from '../../lib/onboarding.js';

const LEVELS = ['beginner', 'intro undergraduate', 'advanced undergraduate', 'graduate', 'professional'] as const;

/** Rough study time, the same arithmetic the Shelf uses: ~25 minutes a lesson. */
function estimate(pack: Curriculum): string {
  const n = countConcepts(pack);
  const hours = (n.lessons * 25) / 60;
  const time = hours >= 1 ? `~${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} h of lessons` : `~${n.lessons * 25} min of lessons`;
  return `${plural(n.units, 'unit')}, ${plural(n.lessons, 'lesson')} · ${time} · ${n.items} review questions`;
}

/** One bundled pack as a selectable row: its name, and what it will cost in time. */
function PackRow({ pack, selected, onSelect }: { pack: Curriculum; selected: boolean; onSelect: () => void }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-input px-3 py-2.5 transition-[background-color] duration-150 ease-out ${selected ? 'bg-fill' : 'hover:bg-fill'}`} data-testid="onboarding-pack">
      <input type="radio" name="onboarding-pack" checked={selected} onChange={onSelect} className="peer sr-only" />
      <span aria-hidden="true" className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${selected ? 'border-accent bg-accent text-on-accent' : 'border-hairline bg-surface'}`}>
        {selected ? <Icon name="check" size={12} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-tight">{pack.manifest.title}</span>
        <span className="mt-1 block text-[13px] leading-snug text-muted">{estimate(pack)}</span>
      </span>
    </label>
  );
}

/**
 * Step 1 (ONBOARDING §3): the decision the learner arrived with, and nothing else. No account, no key,
 * nothing about models — those come later, once there is something on screen worth configuring a tutor for.
 */
export function SubjectStep({
  draft, patch, packs, packsLoading, sources, onPickFiles, onRemoveSource, busy, onContinue,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  packs: Curriculum[];
  packsLoading: boolean;
  sources: IngestedSource[];
  onPickFiles: () => void;
  onRemoveSource: (id: string) => void;
  busy: boolean;
  onContinue: () => void;
}) {
  const ready =
    draft.source === 'pack' ? !!draft.packId
    : draft.source === 'subject' ? (draft.subject ?? '').trim().length > 1
    : sources.length > 0 && (draft.subject ?? '').trim().length > 0;

  const subjectField = (label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={draft.subject ?? ''}
        onChange={(e) => patch({ subject: e.target.value })}
        placeholder="Subject"
        data-testid="onboarding-subject"
        autoFocus={draft.source === 'subject'}
      />
    </Field>
  );

  const levelField = (
    <Field label="Level" hint="How advanced the material should be.">
      <select className={inputClass} value={draft.level ?? DEFAULT_LEVEL} onChange={(e) => patch({ level: e.target.value })} data-testid="onboarding-level">
        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </Field>
  );

  return (
    <div className="space-y-6" data-testid="step-subject">
      <header>
        <h1 className="type-display">What do you want to learn?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Epistemics teaches one subject at a time, in order, and makes you retrieve it until it sticks. Pick where yours comes from.
        </p>
      </header>

      <ChoiceGroup<OnboardingSource>
        label="Where the course comes from"
        testId="onboarding-source"
        value={draft.source}
        onChange={(source) => {
          // The pack's title seeds the subject, so switching away from a pack must not inherit its name.
          const packTitle = packs.find((p) => p.manifest.id === draft.packId)?.manifest.title;
          patch({ source, ...(source !== 'pack' && draft.subject === packTitle ? { subject: '' } : {}) });
        }}
        options={[
          {
            value: 'pack',
            label: 'A course we have written',
            description: 'Hand-authored and checked. Ready to start now, with nothing to generate.',
            detail: packsLoading ? <Skeleton lines={2} label="Loading courses" /> : packs.length ? (
              <div className="-ml-3 space-y-0.5">
                {packs.map((p) => (
                  <PackRow
                    key={`${p.manifest.id}@${p.manifest.version}`}
                    pack={p}
                    selected={draft.packId === p.manifest.id}
                    onSelect={() => patch({ packId: p.manifest.id, packVersion: p.manifest.version, subject: p.manifest.title })}
                  />
                ))}
              </div>
            ) : <p className="text-[13px] text-muted">No packs are bundled with this build. Name a subject instead.</p>,
          },
          {
            value: 'subject',
            label: 'A subject I name',
            description: 'A curriculum is generated for it: units, lessons, and the order they have to be learned in.',
            detail: <div className="space-y-3">{subjectField('Subject', 'e.g. “real analysis”, “microeconomics for an engineer”')}{levelField}</div>,
          },
          {
            value: 'material',
            label: 'My own material',
            description: 'A PDF, EPUB, DOCX or Markdown. It is parsed on this device and the course is grounded in it.',
            detail: (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={onPickFiles} disabled={busy} data-testid="onboarding-pick-files">Add files</Button>
                  {busy ? <Spinner label="Parsing" /> : null}
                </div>
                {sources.length ? (
                  <ul className="space-y-1" data-testid="onboarding-sources">
                    {sources.map((s) => (
                      <li key={s.source.id} className="flex items-center justify-between gap-2 rounded-input bg-nested px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{s.source.title}</span>
                        <IconButton size="sm" icon="x" onClick={() => onRemoveSource(s.source.id)} label={`Remove ${s.source.title}`} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-muted">Your files stay on this device; the text is chunked and indexed locally.</p>}
                {subjectField('Subject', 'What this material teaches.')}
                {levelField}
              </div>
            ),
          },
        ]}
      />

      {/* A disabled action says what is blocking it (UX-AUDIT: never a dead button without a reason). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onContinue} disabled={!ready || busy} data-testid="onboarding-next">Continue</Button>
        {ready ? null : (
          <span className="text-[13px] text-muted" data-testid="subject-blocker">
            {draft.source === 'pack' ? 'Pick a course to continue.' : draft.source === 'material' && !sources.length ? 'Add a file to continue.' : 'Name the subject to continue.'}
          </span>
        )}
      </div>
    </div>
  );
}
