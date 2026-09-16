import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { CourseGoals } from '@epistemics/core';
import { getCurriculum } from '@epistemics/db';
import { Banner, Button, Card, Field, Spinner, inputClass } from '@epistemics/ui';
import { useApp, useQuery } from '../../lib/app-state.js';
import { defaultCourseSettings, enrolInCurriculum, scaffoldingFromBackground } from '../../lib/services/courses.js';

/** Scope interview (DESIGN §3.1): one screen, not a chat. */
export function SetupScreen() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('curriculum') ?? '';
  const version = Number(params.get('version') ?? '1');
  const q = useQuery(() => getCurriculum(app.db, id, version), [id, version]);

  const [purpose, setPurpose] = useState<CourseGoals['purpose']>('understand');
  const [examDate, setExamDate] = useState('');
  const [weekly, setWeekly] = useState(150);
  const [background, setBackground] = useState('');
  const [depth, setDepth] = useState<'intro' | 'working' | 'deep'>('working');
  const [retention, setRetention] = useState(0.9);
  const [reviewsPerDay, setReviewsPerDay] = useState(120);
  const [diagnostic, setDiagnostic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!id) return <Banner tone="bad">No curriculum selected. Go to the Shelf and pick a pack.</Banner>;
  if (q.error) return <Banner tone="bad">{q.error}</Banner>;
  if (!q.data) return q.loading ? <Spinner label="Loading pack" /> : <Banner tone="bad">Pack not found on the shelf.</Banner>;
  const curriculum = q.data;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const goals: CourseGoals = { purpose, weeklyMinutes: weekly, background: background.trim() || undefined };
      if (purpose === 'exam' && examDate) goals.examDate = new Date(`${examDate}T12:00:00`).getTime();
      await enrolInCurriculum(app.db, {
        curriculum,
        goals,
        settings: { ...defaultCourseSettings(), desiredRetention: retention, reviewsPerDay },
        scaffolding: scaffoldingFromBackground(goals.background, depth),
      });
      await app.refreshCourses();
      navigate(diagnostic ? '/diagnostic' : '/today', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="setup-screen">
      <header>
        <h1 className="text-xl font-semibold">Set up: {curriculum.manifest.title}</h1>
        <p className="text-sm text-ink/70">A few questions set your retention target, exam cap and starting scaffolding.</p>
      </header>
      <Card className="space-y-4">
        <Field label="Why are you learning this?">
          <select className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value as CourseGoals['purpose'])} data-testid="purpose">
            <option value="understand">Understand it properly</option>
            <option value="exam">Pass an exam on a date</option>
            <option value="apply">Apply it at work</option>
          </select>
        </Field>
        {purpose === 'exam' ? (
          <Field label="Exam date" hint="Caps review intervals so everything is due before the exam.">
            <input type="date" className={inputClass} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </Field>
        ) : null}
        <Field label={`Weekly time budget: ${weekly} min`}>
          <input type="range" min={30} max={600} step={15} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} className="w-full accent-accent" />
        </Field>
        <Field label="Prior background" hint="What you already know about the subject. Leave blank if new to it.">
          <textarea className={`${inputClass} min-h-20`} value={background} onChange={(e) => setBackground(e.target.value)} data-testid="background" />
        </Field>
        <Field label="Target depth">
          <select className={inputClass} value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)}>
            <option value="intro">Intro: I want the main ideas</option>
            <option value="working">Working knowledge: I want to use it</option>
            <option value="deep">Deep: I want to reason from first principles</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Desired retention: ${(retention * 100).toFixed(0)}%`} hint="Default 90%. Higher means more reviews.">
            <input type="range" min={0.8} max={0.95} step={0.01} value={retention} onChange={(e) => setRetention(Number(e.target.value))} className="w-full accent-accent" />
          </Field>
          <Field label="Reviews per day cap">
            <input type="number" min={20} max={500} className={inputClass} value={reviewsPerDay} onChange={(e) => setReviewsPerDay(Number(e.target.value))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={diagnostic} onChange={(e) => setDiagnostic(e.target.checked)} className="h-4 w-4 accent-accent" data-testid="diagnostic-opt" />
          Run a placement diagnostic first (recommended when you have background)
        </label>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={busy} data-testid="create-course">Create course</Button>
          {busy ? <Spinner label="Creating cards" /> : null}
        </div>
      </Card>
    </div>
  );
}
