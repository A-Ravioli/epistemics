import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Curriculum } from '@epistemics/core';
import { ErrorBanner, Skeleton, Stepper } from '@epistemics/ui';
import { useApp } from '../../lib/app-state.js';
import { API_KEY_SECRET } from '../../lib/llm.js';
import {
  DEFAULT_LEVEL, DEFAULT_MINUTES, STEP_LABELS, getOnboarding, markOnboardingComplete, patchOnboarding,
  setMirror, setTutorChosenHere, stepsFor, needsTutorHere, goalsFor, schedulingFor,
  type OnboardingDraft, type StepId,
} from '../../lib/onboarding.js';
import { setLlmSettings } from '../../lib/settings.js';
import { CurriculumBuilder, startOutlineAhead, type BuildSpec, type IngestedSource } from '../../lib/services/build.js';
import { enrolInCurriculum, scaffoldingFromBackground } from '../../lib/services/courses.js';
import { installPack, listBundledPacks } from '../../lib/services/packs.js';
import { CommitmentStep } from './CommitmentStep.js';
import { RecallStep } from './RecallStep.js';
import { SubjectStep } from './SubjectStep.js';
import { TutorStep, type TutorChoice } from './TutorStep.js';

export { isOnboarded } from '../../lib/onboarding.js';

const ACCEPT = ['.pdf', '.epub', '.docx', '.md', '.markdown', '.txt', 'application/pdf', 'application/epub+zip', 'text/markdown', 'text/plain'];

/**
 * The first run (docs/ONBOARDING.md): subject → what you already know → tutor → time, in that order,
 * because the learner arrives holding a subject and nothing else. It takes the whole window — no sidebar
 * and no inspector — the way DESIGN-SYSTEM §6 grants the first-launch screen.
 *
 * Which steps run is derived, not fixed: `?course=new` starts the flow for an extra course and skips the
 * tutor, and a second device that pulled a course over sync is asked only for a tutor, because the API key
 * is the one answer that really is device-local.
 */
export function WelcomeScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Frozen at mount: answering a step must not reshuffle the steps under the learner.
  const [steps] = useState<StepId[]>(() =>
    stepsFor({ needsCourse: params.get('course') === 'new' || app.courses.length === 0, needsTutor: needsTutorHere() }),
  );
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>({ source: 'pack', level: DEFAULT_LEVEL, minutesPerDay: DEFAULT_MINUTES });
  const [loaded, setLoaded] = useState(false);
  const [packs, setPacks] = useState<Curriculum[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [sources, setSources] = useState<IngestedSource[]>([]);
  const [tutor, setTutor] = useState<TutorChoice>(() => ({
    mode: app.llmSettings.mode === 'mock' ? 'anthropic' : app.llmSettings.mode,
    transport: app.llmSettings.transport,
    apiKey: '',
    ollamaBaseUrl: app.llmSettings.ollamaBaseUrl,
    ollamaModel: app.llmSettings.ollamaModel,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const heading = useRef<HTMLDivElement>(null);

  const builder = useMemo(() => new CurriculumBuilder(app.db, app.llm.provider), [app.db, app.llm.provider]);
  const step: StepId | undefined = steps[index];
  const pack = draft.source === 'pack' ? packs.find((p) => p.manifest.id === draft.packId) : undefined;

  // Nothing left to ask: a course and a tutor are both in place.
  useEffect(() => {
    if (steps.length === 0) {
      setMirror(true);
      navigate('/today', { replace: true });
    }
  }, [steps, navigate]);

  /* Resume where a reload interrupted the flow, and pick up a draft a synced device left behind. */
  useEffect(() => {
    let live = true;
    getOnboarding(app.db)
      .then((stored) => {
        if (!live) return;
        if (stored) setDraft((d) => ({ ...d, ...stored }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      live = false;
    };
  }, [app.db]);

  useEffect(() => {
    let live = true;
    Promise.all(
      listBundledPacks().map((p) => p.load().catch((e: unknown) => {
        console.warn('bundled pack failed to load', p.file, e);
        return undefined;
      })),
    )
      .then((loadedPacks) => {
        if (!live) return;
        const ready = loadedPacks.filter((p): p is Curriculum => !!p);
        setPacks(ready);
        setPacksLoading(false);
        // Open on a screen that can be continued: the first course is the default, not a second click.
        const first = ready[0];
        if (first) setDraft((d) => (d.packId ? d : { ...d, packId: first.manifest.id, packVersion: first.manifest.version, subject: first.manifest.title }));
      })
      .catch(() => setPacksLoading(false));
    return () => {
      live = false;
    };
  }, []);

  // Each step owns the top of the column, so focus follows it rather than staying on the button just left behind.
  useEffect(() => {
    const h1 = heading.current?.querySelector('h1');
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus();
  }, [index]);

  const patch = useCallback((p: Partial<OnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const spec = useCallback((d: OnboardingDraft): BuildSpec => ({
    subject: (d.subject ?? '').trim(),
    level: d.level ?? DEFAULT_LEVEL,
    sourceIds: (d.sources ?? []).map((s) => s.id),
  }), []);

  /** Persist what has been answered, then move on. The draft is written every step so a reload resumes. */
  const advance = useCallback(
    async (next: OnboardingDraft) => {
      setDraft(next);
      setError(undefined);
      try {
        await patchOnboarding(app.db, next);
      } catch (e) {
        console.warn('could not save the onboarding draft', e);
      }
      setIndex((i) => i + 1);
    },
    [app.db],
  );

  const pickFiles = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const files = await app.platform.files.pick(ACCEPT);
      if (!files.length) return;
      const r = await builder.ingestFiles(files);
      if (r.sources.length) {
        const merged = [...sources.filter((p) => !r.sources.some((s) => s.source.id === p.source.id)), ...r.sources];
        setSources(merged);
        patch({
          sources: merged.map((s) => ({ id: s.source.id, title: s.source.title })),
          ...((draft.subject ?? '').trim() ? {} : { subject: r.sources[0]!.source.title }),
        });
      }
      if (r.errors.length) setError(r.errors.join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveTutor = async (choice: TutorChoice) => {
    if (choice.mode === 'anthropic' && choice.transport === 'byok' && choice.apiKey.trim()) {
      await app.platform.secrets.set(API_KEY_SECRET, choice.apiKey.trim());
    }
    await setLlmSettings(app.db, {
      ...app.llmSettings,
      mode: choice.mode,
      transport: choice.transport,
      ollamaBaseUrl: choice.ollamaBaseUrl,
      ollamaModel: choice.ollamaModel,
    });
    const web = app.platform as { setLlmMode?: (m: 'proxy' | 'byok') => Promise<void> };
    if (web.setLlmMode && choice.mode === 'anthropic') await web.setLlmMode(choice.transport);
    await app.reloadLlm();
    setTutorChosenHere(true);
  };

  /** Leaving the tutor step: on a generated course, start outlining behind the next step (ONBOARDING §3). */
  const leaveTutor = async (deferred: boolean) => {
    setBusy(true);
    try {
      if (!deferred) await saveTutor(tutor);
      else setTutorChosenHere(true); // asked and answered; Today carries the unfinished business
      const next = { ...draft, tutorDeferred: deferred || tutor.mode === 'mock' };
      if (steps.length === 1) {
        // The tutor was the only thing missing: a second device with a synced course.
        await patchOnboarding(app.db, next);
        setMirror(true);
        navigate('/today', { replace: true });
        return;
      }
      if (next.source !== 'pack' && spec(next).subject) startOutlineAhead(builder, spec(next));
      await advance(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** The end of the flow: a pack is enrolled here and now; a generated course goes on to the outline. */
  const finish = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const next = { ...draft };
      await patchOnboarding(app.db, next);
      const minutes = next.minutesPerDay ?? DEFAULT_MINUTES;
      const { reviewsPerDay, desiredRetention } = schedulingFor(minutes);

      if (next.source === 'pack') {
        if (!pack) throw new Error('Pick a course to start.');
        await installPack(app.db, pack);
        await enrolInCurriculum(app.db, {
          curriculum: pack,
          goals: goalsFor(next),
          settings: { desiredRetention, reviewsPerDay },
          scaffolding: scaffoldingFromBackground(next.recall, 'working'),
        });
        await app.refreshCourses();
        await markOnboardingComplete(app.db);
        navigate(next.placement ? '/diagnostic' : '/today', { replace: true });
        return;
      }
      // Generated course: the outline is an editorial decision, and it lives on the Setup screen.
      startOutlineAhead(builder, spec(next));
      navigate('/setup?from=onboarding', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!loaded || steps.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 justify-center px-5 py-10" data-testid="welcome-screen">
        <div className="w-full max-w-[620px]"><Skeleton lines={4} label="Getting started" /></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center px-5 py-10" data-testid="welcome-screen" data-step={step}>
      <div className="w-full max-w-[620px] space-y-8" ref={heading}>
        {steps.length > 1 ? <Stepper steps={steps.map((s) => STEP_LABELS[s])} current={index} label="Getting started" /> : null}

        {error ? <ErrorBanner message={error} /> : null}

        {step === 'subject' ? (
          <SubjectStep
            draft={draft}
            patch={patch}
            packs={packs}
            packsLoading={packsLoading}
            sources={sources}
            onPickFiles={pickFiles}
            onRemoveSource={(id) => {
              const kept = sources.filter((s) => s.source.id !== id);
              setSources(kept);
              patch({ sources: kept.map((s) => ({ id: s.source.id, title: s.source.title })) });
            }}
            busy={busy}
            onContinue={() => void advance(draft)}
          />
        ) : null}

        {step === 'recall' ? (
          <RecallStep
            draft={draft}
            patch={patch}
            {...(pack ? { pack } : {})}
            onContinue={() => void advance(draft)}
            onSkip={() => void advance({ ...draft, recall: '' })}
          />
        ) : null}

        {step === 'tutor' ? (
          <TutorStep
            value={tutor}
            onChange={setTutor}
            platform={app.platform}
            busy={busy}
            standalone={steps.length === 1}
            onContinue={() => void leaveTutor(false)}
            onSkip={() => void leaveTutor(true)}
          />
        ) : null}

        {step === 'commitment' ? (
          <CommitmentStep
            draft={draft}
            patch={patch}
            building={draft.source !== 'pack'}
            busy={busy}
            onFinish={() => void finish()}
            finishLabel={draft.source === 'pack' ? (draft.placement ? 'Start the placement quiz' : 'Start learning') : 'Sketch my curriculum'}
          />
        ) : null}
      </div>
    </div>
  );
}
