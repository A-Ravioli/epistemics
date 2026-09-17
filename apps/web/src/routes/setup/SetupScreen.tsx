import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { OutlineOutput } from '@epistemics/architect';
import type { CourseGoals, Curriculum } from '@epistemics/core';
import { getCurriculum } from '@epistemics/db';
import { Banner, Button, Card, ErrorBanner, Field, IconButton, Page, PageHeader, PanelSection, Pill, Skeleton, Spinner, Stepper, Tabs, Workspace, inputClass } from '@epistemics/ui';
import { useApp, useQuery } from '../../lib/app-state.js';
import { plural } from '../../lib/format.js';
import { CurriculumBuilder, INITIAL_UNITS, takeOutlineAhead, type BuildSpec, type IngestedSource, type OutlineProposal } from '../../lib/services/build.js';
import { DEFAULT_LEVEL, DEFAULT_MINUTES, getOnboarding, markOnboardingComplete, schedulingFor, type OnboardingSourceRef } from '../../lib/onboarding.js';
import { defaultCourseSettings, enrolInCurriculum, scaffoldingFromBackground } from '../../lib/services/courses.js';
import { useStore } from '../../lib/store.js';
import { BuildProgressView } from './BuildProgressView.js';
import { OutlineReview } from './OutlineReview.js';

/** Entry modes (DESIGN §3.1 step 1): a shelved pack, a subject name, or uploaded material. */
type Mode = 'shelf' | 'subject' | 'material';
type Step = 'source' | 'interview' | 'outline' | 'build';

const LEVELS = ['beginner', 'intro undergraduate', 'advanced undergraduate', 'graduate', 'professional'] as const;
const ACCEPT = ['.pdf', '.epub', '.docx', '.md', '.markdown', '.txt', 'application/pdf', 'application/epub+zip', 'text/markdown', 'text/plain'];

interface Interview {
  purpose: CourseGoals['purpose'];
  examDate: string;
  weekly: number;
  background: string;
  depth: 'intro' | 'working' | 'deep';
  retention: number;
  reviewsPerDay: number;
  diagnostic: boolean;
}

const defaultInterview = (): Interview => ({ purpose: 'understand', examDate: '', weekly: 150, background: '', depth: 'working', retention: 0.9, reviewsPerDay: 120, diagnostic: false });

export function SetupScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const packId = params.get('curriculum') ?? '';
  /** Arriving from the first run: the answers are already given, so only the outline is left to decide. */
  const fromOnboarding = params.get('from') === 'onboarding';
  const packVersion = Number(params.get('version') ?? '1');
  const packQ = useQuery(async () => (packId ? getCurriculum(app.db, packId, packVersion) : undefined), [packId, packVersion]);

  const builder = useMemo(() => new CurriculumBuilder(app.db, app.llm.provider), [app.db, app.llm.provider]);
  const progress = useStore(builder.store);

  const [mode, setMode] = useState<Mode>(packId ? 'shelf' : 'subject');
  const [step, setStep] = useState<Step>(packId ? 'interview' : fromOnboarding ? 'outline' : 'source');
  const [bootstrapped, setBootstrapped] = useState(!fromOnboarding);
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState<string>('intro undergraduate');
  const [goalsText, setGoalsText] = useState('');
  const [sources, setSources] = useState<IngestedSource[]>([]);
  /** Sources the onboarding flow already ingested: ids and titles, without re-parsing the files. */
  const [presetSources, setPresetSources] = useState<OnboardingSourceRef[]>([]);
  const [interview, setInterview] = useState<Interview>(defaultInterview);
  const [proposal, setProposal] = useState<OutlineProposal | undefined>();
  const [outline, setOutline] = useState<OutlineOutput | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const patch = (p: Partial<Interview>) => setInterview((prev) => ({ ...prev, ...p }));
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  /** The sources this build is grounded in, whether picked here or carried in from the first run. */
  const sourceRefs: OnboardingSourceRef[] = sources.length ? sources.map((x) => ({ id: x.source.id, title: x.source.title })) : presetSources;

  const spec = (): BuildSpec => {
    const s: BuildSpec = { subject: subject.trim(), level, sourceIds: sourceRefs.map((x) => x.id) };
    const g = goalsText.trim();
    if (g) s.goals = g;
    return s;
  };

  const goalsOf = (): CourseGoals => {
    const goals: CourseGoals = { purpose: interview.purpose, weeklyMinutes: interview.weekly, background: interview.background.trim() || undefined };
    if (interview.purpose === 'exam' && interview.examDate) goals.examDate = new Date(`${interview.examDate}T12:00:00`).getTime();
    return goals;
  };

  const enrolAndGo = async (curriculum: Curriculum) => {
    await enrolInCurriculum(app.db, {
      curriculum,
      goals: goalsOf(),
      settings: { ...defaultCourseSettings(), desiredRetention: interview.retention, reviewsPerDay: interview.reviewsPerDay },
      scaffolding: scaffoldingFromBackground(interview.background, interview.depth),
    });
    await app.refreshCourses();
    if (fromOnboarding) await markOnboardingComplete(app.db);
    navigate(interview.diagnostic ? '/diagnostic' : '/today', { replace: true });
  };

  /*
   * The first run collected the subject, the material, what the learner already knows and how much time
   * they have (docs/ONBOARDING.md), and started the outline while they were still reading. Pick all of it
   * up, skip the interview, and land on the one decision left that is genuinely editorial: the outline.
   */
  useEffect(() => {
    if (bootstrapped) return;
    let live = true;
    void (async () => {
      const draft = await getOnboarding(app.db).catch(() => undefined);
      if (!live) return;
      if (!draft?.subject) {
        // No draft to resume (storage cleared, or a stale link): fall back to asking normally.
        setBootstrapped(true);
        setStep('source');
        return;
      }
      const refs = draft.sources ?? [];
      const built: BuildSpec = { subject: draft.subject.trim(), level: draft.level ?? DEFAULT_LEVEL, sourceIds: refs.map((r) => r.id) };
      const sched = schedulingFor(draft.minutesPerDay ?? DEFAULT_MINUTES);
      setMode(refs.length ? 'material' : 'subject');
      setSubject(built.subject);
      setLevel(built.level);
      setPresetSources(refs);
      setInterview((prev) => ({
        ...prev,
        purpose: draft.purpose ?? 'understand',
        examDate: draft.examDate ?? '',
        weekly: sched.weeklyMinutes,
        background: draft.recall ?? '',
        retention: sched.desiredRetention,
        reviewsPerDay: sched.reviewsPerDay,
        diagnostic: !!draft.placement,
      }));
      setBootstrapped(true);
      setBusy(true);
      try {
        // The flow may already have this in flight; claiming it is the whole point of starting it early.
        const p = await (takeOutlineAhead(built) ?? builder.proposeOutline(built));
        if (!live) return;
        setProposal(p);
        setOutline(structuredClone(p.outline));
      } catch (e) {
        if (live) fail(e);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [bootstrapped, app.db, builder]);

  const pickFiles = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const files = await app.platform.files.pick(ACCEPT);
      if (!files.length) return;
      const r = await builder.ingestFiles(files);
      if (r.sources.length) {
        setSources((prev) => [...prev.filter((p) => !r.sources.some((s) => s.source.id === p.source.id)), ...r.sources]);
        if (!subject.trim()) setSubject(r.sources[0]!.source.title);
      }
      if (r.errors.length) setError(r.errors.join(' '));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitInterview = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'shelf') {
        if (!packQ.data) throw new Error('Pack not found on the shelf.');
        await enrolAndGo(packQ.data);
        return;
      }
      const p = await builder.proposeOutline(spec());
      setProposal(p);
      setOutline(structuredClone(p.outline));
      setStep('outline');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const build = async () => {
    if (!proposal || !outline) return;
    setBusy(true);
    setError(undefined);
    setStep('build');
    try {
      const curriculum = await builder.build(proposal, outline);
      await enrolAndGo(curriculum);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // --- shelf mode needs its pack ---
  if (mode === 'shelf') {
    if (packQ.error) return <Page width="sm"><ErrorBanner title="Could not load the pack" message={packQ.error} onRetry={packQ.refresh} /></Page>;
    if (!packQ.data) return <Page width="sm">{packQ.loading ? <Card><Skeleton lines={3} label="Loading pack" /></Card> : <ErrorBanner title="Pack not found on the shelf" message="It may have been removed." onRetry={() => navigate('/shelf')} retryLabel="Back to the Shelf" />}</Page>;
  }
  const title = mode === 'shelf' ? `Set up: ${packQ.data?.manifest.title ?? ''}` : step === 'source' ? 'Start a course' : `Set up: ${outline?.title ?? (subject.trim() || 'new course')}`;
  const canContinue = mode === 'subject' ? subject.trim().length > 1 : sources.length > 0 && subject.trim().length > 0;

  const outlineMeta = step === 'outline' && outline ? (
    <div>
      <PanelSection title="Outline">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="accent">{plural(outline.units.length, 'unit')}</Pill>
          <Pill tone="neutral">{plural(outline.units.reduce((a, u) => a + u.lessons.length, 0), 'lesson')}</Pill>
          <Pill tone={sourceRefs.length ? 'good' : 'neutral'}>{sourceRefs.length ? `${plural(sourceRefs.length, 'source')} · grounded` : 'subject only'}</Pill>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Builds {Math.min(INITIAL_UNITS, outline.units.length)} of {outline.units.length} units now; later units are generated two ahead of you.</p>
      </PanelSection>
      <PanelSection title="What you can change">
        <ul className="space-y-1.5 text-[13px] leading-snug text-muted">
          <li>Rename the course, any unit or lesson.</li>
          <li>Reorder units with the arrows.</li>
          <li>Drop lessons or units you do not need.</li>
        </ul>
      </PanelSection>
      {sourceRefs.length ? (
        <PanelSection title="Sources">
          <ul className="space-y-1 text-[13px] text-muted">{sourceRefs.map((x) => <li key={x.id} className="truncate">{x.title}</li>)}</ul>
        </PanelSection>
      ) : null}
    </div>
  ) : undefined;

  const page = (
    <Page width="sm" data-testid="setup-screen" data-step={step}>
      <PageHeader
        title={title}
        actions={<IconButton icon="back" label="Back to the Shelf" onClick={() => navigate('/shelf')} data-testid="setup-back" />}
        description={
          step === 'source' ? 'Pick a pack from the Shelf, name a subject, or upload your own material.'
            : step === 'interview' ? 'A few questions set how much you review, how far intervals may stretch, and how much help the tutor starts with.'
            : step === 'outline' ? (outline ? 'Rename, reorder or drop units and lessons before anything is generated. The first two units are built now; later ones are generated two ahead of you.' : 'Sketching the units and lessons your subject needs, and the order they have to be learned in.')
            : 'The Architect is generating concepts, the prerequisite graph, lesson scripts and review questions. This can take a few minutes.'
        }
      />
      <Stepper
        steps={mode === 'shelf' ? ['Pack', 'Your goals'] : fromOnboarding ? ['Outline', 'Build'] : ['Source', 'Your goals', 'Outline', 'Build']}
        current={mode === 'shelf' ? 1 : fromOnboarding ? ['outline', 'build'].indexOf(step) : ['source', 'interview', 'outline', 'build'].indexOf(step)}
        label="Setup steps"
      />

      {step === 'source' ? (
        <Card className="space-y-4">
          <Tabs<Mode> tabs={[{ id: 'shelf', label: 'From the Shelf' }, { id: 'subject', label: 'From a subject' }, { id: 'material', label: 'From my material' }]} value={mode} onChange={(m) => (m === 'shelf' ? navigate('/shelf') : setMode(m))} />
          {mode === 'material' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={pickFiles} disabled={busy} data-testid="pick-files">Add files (PDF, EPUB, DOCX, Markdown, syllabus)</Button>
                {progress.phase === 'ingesting' ? <Spinner label={progress.message ?? 'Parsing'} /> : null}
              </div>
              {sources.length ? (
                <ul className="space-y-1" data-testid="source-list">
                  {sources.map((s) => (
                    <li key={s.source.id} className="flex items-center justify-between gap-2 rounded-input bg-nested px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{s.source.title}</span>
                        <span className="ml-2 text-xs text-muted">
                          {s.source.kind.toUpperCase()}{s.source.pageCount ? ` · ${plural(s.source.pageCount, 'page')}` : ''} · {plural(s.chunkCount, 'chunk')} · ~{s.tokenCount.toLocaleString()} tokens
                        </span>
                      </span>
                      <IconButton size="sm" icon="x" onClick={() => setSources(sources.filter((x) => x.source.id !== s.source.id))} label={`Remove ${s.source.title}`} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted">Nothing added yet. Your files stay on this device; text is chunked and indexed locally.</p>}
            </div>
          ) : null}
          <Field label={mode === 'material' ? 'Subject (what this material teaches)' : 'Subject'} hint={mode === 'subject' ? 'e.g. "real analysis", "microeconomics for an engineer"' : undefined}>
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="subject" placeholder="Subject" />
          </Field>
          <Field label="Level" hint="How advanced the material should be.">
            <select className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} data-testid="level">
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Goals and scope" hint="Optional: what you want to be able to do, what to leave out.">
            <textarea className={`${inputClass} min-h-20`} value={goalsText} onChange={(e) => setGoalsText(e.target.value)} data-testid="goals" />
          </Field>
          {error ? <ErrorBanner message={error} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => { setError(undefined); setStep('interview'); }} disabled={!canContinue || busy} data-testid="continue-to-interview">Continue</Button>
            <Link to="/shelf" className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">Or pick a pack from the Shelf</Link>
          </div>
        </Card>
      ) : null}

      {step === 'interview' ? (
        <Card className="space-y-4">
          <Field label="Why are you learning this?" hint="Sets what the course optimises for; an exam date caps review intervals so everything is due before it.">
            <select className={inputClass} value={interview.purpose} onChange={(e) => patch({ purpose: e.target.value as CourseGoals['purpose'] })} data-testid="purpose">
              <option value="understand">Understand it properly</option>
              <option value="exam">Pass an exam on a date</option>
              <option value="apply">Apply it at work</option>
            </select>
          </Field>
          {interview.purpose === 'exam' ? (
            <Field label="Exam date" hint="Caps review intervals so everything is due before the exam.">
              <input type="date" className={inputClass} value={interview.examDate} onChange={(e) => patch({ examDate: e.target.value })} />
            </Field>
          ) : null}
          <Field label={`Weekly time budget: ${interview.weekly} min`} hint="Lessons plus reviews. The forecast on Progress is measured against this.">
            <input type="range" min={30} max={600} step={15} value={interview.weekly} onChange={(e) => patch({ weekly: Number(e.target.value) })} className="w-full accent-primary" />
          </Field>
          <Field label="Prior background" hint="What you already know about the subject. Leave blank if new to it.">
            <textarea className={`${inputClass} min-h-20`} value={interview.background} onChange={(e) => patch({ background: e.target.value })} data-testid="background" />
          </Field>
          <Field label="Target depth" hint="With your background, this decides how much help the tutor starts with.">
            <select className={inputClass} value={interview.depth} onChange={(e) => patch({ depth: e.target.value as Interview['depth'] })}>
              <option value="intro">Intro: I want the main ideas</option>
              <option value="working">Working knowledge: I want to use it</option>
              <option value="deep">Deep: I want to reason from first principles</option>
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Desired retention: ${(interview.retention * 100).toFixed(0)}%`} hint="Default 90%. Higher means more reviews.">
              <input type="range" min={0.8} max={0.95} step={0.01} value={interview.retention} onChange={(e) => patch({ retention: Number(e.target.value) })} className="w-full accent-primary" />
            </Field>
            <Field label="Reviews per day, at most" hint="Cards due beyond this become review debt.">
              <input type="number" min={20} max={500} className={inputClass} value={interview.reviewsPerDay} onChange={(e) => patch({ reviewsPerDay: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={interview.diagnostic} onChange={(e) => patch({ diagnostic: e.target.checked })} className="h-4 w-4 accent-primary" data-testid="diagnostic-opt" />
            Run a placement quiz first: skips lessons on concepts you already know (recommended if you have background)
          </label>
          {error ? <ErrorBanner message={error} onRetry={submitInterview} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            {mode === 'shelf' ? (
              <Button onClick={submitInterview} disabled={busy} data-testid="create-course">Create course</Button>
            ) : (
              <>
                <Button onClick={submitInterview} disabled={busy} data-testid="propose-outline">Propose outline</Button>
                <Button variant="ghost" onClick={() => setStep('source')} disabled={busy}>Back</Button>
              </>
            )}
            {busy ? <Spinner label={mode === 'shelf' ? 'Creating your course' : progress.message ?? 'Asking the Architect for an outline'} /> : null}
          </div>
        </Card>
      ) : null}

      {step === 'outline' && !outline ? (
        <Card data-testid="outline-loading">
          {error ? <ErrorBanner title="Could not sketch the outline" message={error} onRetry={() => { setBootstrapped(false); setError(undefined); }} /> : <Skeleton lines={4} label="Sketching your curriculum" />}
        </Card>
      ) : null}

      {step === 'outline' && outline ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted lg:hidden">
            <Pill tone="accent">{plural(outline.units.length, 'unit')}</Pill>
            <Pill tone="neutral">{plural(outline.units.reduce((a, u) => a + u.lessons.length, 0), 'lesson')}</Pill>
            <Pill tone="neutral">{sources.length ? `${plural(sources.length, 'source')} · grounded` : 'subject only'}</Pill>
            <span>Builds {Math.min(INITIAL_UNITS, outline.units.length)} of {outline.units.length} units now.</span>
          </div>
          <OutlineReview outline={outline} onChange={setOutline} />
          {error ? <ErrorBanner message={error} onRetry={build} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={build} disabled={busy || !outline.units.length || outline.title.trim() === '' || outline.units.some((u) => !u.title.trim() || u.lessons.some((l) => !l.title.trim()))} data-testid="build-course">Build course</Button>
            <Button variant="ghost" onClick={() => setStep('interview')} disabled={busy}>Back</Button>
          </div>
        </div>
      ) : null}

      {step === 'build' ? (
        <div className="space-y-3">
          <BuildProgressView progress={progress} outline={outline} unitsToBuild={INITIAL_UNITS} />
          {progress.phase === 'done' && busy ? <Spinner label="Creating your course" /> : null}
          {error ? (
            <div className="flex flex-wrap items-center gap-3">
              <Banner tone="bad" className="flex-1">{error}</Banner>
              <Button variant="secondary" onClick={build} disabled={busy}>Retry</Button>
              <Button variant="ghost" onClick={() => setStep('outline')} disabled={busy}>Back to outline</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Page>
  );

  return outlineMeta ? <Workspace aside={outlineMeta} asideLabel="Outline summary">{page}</Workspace> : page;
}
