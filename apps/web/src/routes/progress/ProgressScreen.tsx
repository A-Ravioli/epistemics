import { Banner, Card, Meter, Pill, Spinner, Stat } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { pct, usd } from '../../lib/format.js';
import { loadProgress } from '../../lib/services/progress.js';

export function ProgressScreen() {
  const ctx = useCourse();
  const q = useQuery(() => loadProgress(ctx), [ctx.course.id]);
  if (q.error) return <Banner tone="bad">{q.error}</Banner>;
  if (!q.data) return <Spinner label="Computing progress" />;
  const p = q.data;
  const gap = p.assistedRate - p.unassistedRate;
  const maxLoad = Math.max(1, ...p.forecast.map((d) => d.reviews + d.newCards));
  const maxHist = Math.max(1, ...p.debtHistory.map((d) => d.reviews));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Progress</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mastered" value={`${p.mastered}/${p.total}`} hint={`${p.started} started`} tone={p.mastered > 0 ? 'good' : 'neutral'} />
        <Stat label="Unassisted pass" value={pct(p.unassistedRate)} hint="what counts" />
        <Stat label="Assisted pass" value={pct(p.assistedRate)} hint={gap > 0.2 ? 'gap widening: the tutor may be doing the work' : 'gap small'} tone={gap > 0.2 ? 'warn' : 'neutral'} />
        <Stat label="Cost this month" value={usd(p.cost.month)} hint={`${p.cost.calls} calls, ${usd(p.cost.total)} total`} />
      </div>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">Unassisted vs assisted, by week</h2>
        {p.trend.length === 0 ? <p className="text-sm text-ink/60">No graded attempts yet.</p> : (
          <div className="space-y-1">
            {p.trend.map((w) => (
              <div key={w.week} className="grid grid-cols-[6rem_1fr_1fr_3rem] items-center gap-2 text-xs">
                <span className="text-ink/60">{w.week}</span>
                <Meter label="unassisted" value={Math.round(w.unassisted * 100)} max={100} tone="good" suffix="%" />
                <Meter label="assisted" value={Math.round(w.assisted * 100)} max={100} tone="accent" suffix="%" />
                <span className="text-right text-ink/60">n={w.n}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">Calibration</h2>
        <p className="text-sm text-ink/70">Brier {p.calibration.brier.toFixed(3)} (0 perfect, 0.25 chance) · bias {p.calibration.overconfidenceBias >= 0 ? '+' : ''}{p.calibration.overconfidenceBias.toFixed(2)} ({p.calibration.overconfidenceBias > 0.05 ? 'overconfident' : p.calibration.overconfidenceBias < -0.05 ? 'underconfident' : 'well calibrated'}) · n={p.calibration.n}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {p.bins.map((b) => (
            <div key={b.confidence} className="rounded-md border border-line p-2 text-xs">
              <div className="font-medium">{['', 'Guess', 'Fairly sure', 'Certain'][b.confidence]} <span className="text-ink/50">(n={b.n})</span></div>
              <Meter label="predicted" value={Math.round(b.predicted * 100)} max={100} suffix="%" className="mt-1" />
              <Meter label="observed" value={Math.round(b.observed * 100)} max={100} tone={b.gap > 0.1 ? 'warn' : 'good'} suffix="%" className="mt-1" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">High-confidence errors: worth your attention</h2>
        {p.highConfidenceErrors.length === 0 ? <p className="text-sm text-ink/60">None recorded. Good sign.</p> : (
          <ul className="space-y-2 text-sm">
            {p.highConfidenceErrors.map((r) => (
              <li key={r.id} className="rounded-md border border-line p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60"><Pill tone="bad">certain, wrong</Pill><span>{r.conceptName}</span><span>{new Date(r.createdAt).toLocaleDateString()}</span></div>
                <p className="mt-1 text-ink/80">{r.prompt}</p>
                <p className="mt-1 text-xs text-ink/60">You said: {r.answer.slice(0, 200)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold">Review history (last 30 study days)</h2>
          {p.debtHistory.length === 0 ? <p className="text-sm text-ink/60">No reviews yet.</p> : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Reviews per day">
              {p.debtHistory.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.reviews} reviews, ${d.lapses} lapses`}>
                  <div className="w-full rounded-t bg-accent" style={{ height: `${(d.reviews / maxHist) * 100}%` }} />
                  {d.lapses ? <div className="w-full bg-rose-400" style={{ height: `${(d.lapses / maxHist) * 100}%` }} /> : null}
                </div>
              ))}
            </div>
          )}
          {p.overrides.length ? <p className="text-xs text-ink/60">Gate overrides: {p.overrides.length} ({p.overrides.slice(-3).join(', ')})</p> : null}
        </Card>
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold">Forecast (next 14 days)</h2>
          {p.forecast.length === 0 ? <p className="text-sm text-ink/60">No active cards yet.</p> : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Forecast load per day">
              {p.forecast.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.reviews} reviews, ~${d.minutes} min${d.debt ? `, debt ${d.debt}` : ''}`}>
                  <div className={`w-full rounded-t ${d.debt > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ height: `${((d.reviews + d.newCards) / maxLoad) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink/60">Simulated with a synthetic learner at your retention target.</p>
        </Card>
      </div>

      {p.cost.byRole.length ? (
        <Card>
          <h2 className="text-sm font-semibold">Cost by role (this month, all courses)</h2>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="text-left text-ink/60"><th>role</th><th>calls</th><th>input</th><th>cache read</th><th>output</th><th>cost</th><th>avg latency</th></tr></thead>
            <tbody>
              {p.cost.byRole.map((r) => (
                <tr key={r.role} className="border-t border-line"><td>{r.role}</td><td>{r.calls}</td><td>{r.inputTokens}</td><td>{r.cacheRead}</td><td>{r.outputTokens}</td><td>{usd(r.costUsd)}</td><td>{Math.round(r.avgLatencyMs)} ms</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
