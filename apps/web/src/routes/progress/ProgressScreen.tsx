import { Card, ErrorBanner, Meter, Page, PageHeader, Pill, SectionTitle, Skeleton, Stat } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { pct, usd } from '../../lib/format.js';
import { loadProgress } from '../../lib/services/progress.js';

export function ProgressScreen() {
  const ctx = useCourse();
  const q = useQuery(() => loadProgress(ctx), [ctx.course.id]);
  if (q.error) return <Page><ErrorBanner title="Could not compute progress" message={q.error} onRetry={q.refresh} /></Page>;
  if (!q.data) {
    return (
      <Page data-testid="progress-loading">
        <PageHeader title="Progress" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton lines={2} label={i === 0 ? 'Computing progress' : 'Loading'} /></Card>)}</div>
        <Card><Skeleton lines={4} /></Card>
      </Page>
    );
  }
  const p = q.data;
  const gap = p.assistedRate - p.unassistedRate;
  const maxLoad = Math.max(1, ...p.forecast.map((d) => d.reviews + d.newCards));
  const maxHist = Math.max(1, ...p.debtHistory.map((d) => d.reviews));
  const bias = p.calibration.overconfidenceBias;
  const biasWord = bias > 0.05 ? 'you tend to be surer than you should be' : bias < -0.05 ? 'you tend to know more than you think' : 'your confidence matches your results';

  return (
    <Page>
      <PageHeader title="Progress" crumbs={[{ label: 'My courses', to: '/shelf' }, { label: ctx.course.title, to: '/today' }, { label: 'Progress' }]} description="Only unaided results count toward mastery; everything here is measured that way." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mastered" value={`${p.mastered}/${p.total}`} hint={`concepts fully learned; ${p.started} started`} tone={p.mastered > 0 ? 'good' : 'neutral'} />
        <Stat label="Unaided pass" value={pct(p.unassistedRate)} hint="share of checks passed with no help; this is what counts" />
        <Stat label="With help" value={pct(p.assistedRate)} hint={gap > 0.2 ? 'much higher than unaided: the tutor may be doing the work' : 'close to the unaided rate: good sign'} tone={gap > 0.2 ? 'warn' : 'neutral'} />
        <Stat label="Cost this month" value={usd(p.cost.month)} hint={`${p.cost.calls} tutor calls; ${usd(p.cost.total)} all time`} />
      </div>

      <Card className="space-y-2">
        <SectionTitle>Pass rate by week: unaided vs with help</SectionTitle>
        <p className="text-[13px] leading-relaxed text-muted">The two lines should be close and both rising. A wide gap means you can do it with the tutor but not alone yet.</p>
        {p.trend.length === 0 ? <p className="text-sm text-muted">No graded attempts yet. Finish a lesson to see your first week.</p> : (
          <div className="space-y-2">
            {p.trend.map((w) => (
              <div key={w.week} className="grid grid-cols-1 items-center gap-2 text-xs sm:grid-cols-[6rem_1fr_1fr_3rem]">
                <span className="text-muted">week of {w.week}</span>
                <Meter label="unaided" value={Math.round(w.unassisted * 100)} max={100} tone="good" suffix="%" showMax={false} />
                <Meter label="with help" value={Math.round(w.assisted * 100)} max={100} tone="accent" suffix="%" showMax={false} />
                <span className="text-muted sm:text-right">{w.n} graded</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <SectionTitle>How well you know what you know</SectionTitle>
        <p className="text-sm text-muted">Based on {p.calibration.n} answers where you said how sure you were: {biasWord}. Brier score {p.calibration.brier.toFixed(3)} (0 is perfect, 0.25 is coin-flipping).</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {p.bins.map((b) => (
            <div key={b.confidence} className="rounded-input bg-nested p-3 text-xs">
              <div className="font-medium">When you said “{['', 'Guess', 'Fairly sure', 'Certain'][b.confidence]}” <span className="text-muted">({b.n} times)</span></div>
              <Meter label="expected right" value={Math.round(b.predicted * 100)} max={100} suffix="%" showMax={false} className="mt-1" />
              <Meter label="actually right" value={Math.round(b.observed * 100)} max={100} tone={b.gap > 0.1 ? 'warn' : 'good'} suffix="%" showMax={false} className="mt-1" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Confident misses</SectionTitle>
        <p className="text-xs text-muted">Answers you were certain about and got wrong. These are the most valuable errors to look at: correcting a confident belief sticks best.</p>
        {p.highConfidenceErrors.length === 0 ? <p className="text-sm text-muted">None recorded. Good sign.</p> : (
          <ul className="space-y-2 text-sm">
            {p.highConfidenceErrors.map((r) => (
              <li key={r.id} className="rounded-input bg-nested p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><Pill tone="bad">certain, wrong</Pill><span>{r.conceptName}</span><span>{new Date(r.createdAt).toLocaleDateString()}</span></div>
                <p className="reading-sm mt-1.5 text-ink">{r.prompt}</p>
                <p className="mt-1 break-words text-xs text-muted">You said: {r.answer.slice(0, 200)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <SectionTitle>Reviews per day (last 30 study days)</SectionTitle>
          <p className="text-xs text-muted">Bar height is reviews answered; red marks cards you got wrong.</p>
          {p.debtHistory.length === 0 ? <p className="text-sm text-muted">No reviews yet.</p> : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label={`Reviews per day for the last ${p.debtHistory.length} study days`}>
              {p.debtHistory.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.reviews} reviews, ${d.lapses} wrong`}>
                  <div className="w-full rounded-t-sm bg-ink" style={{ height: `${(d.reviews / maxHist) * 100}%` }} />
                  {d.lapses ? <div className="w-full bg-red-fg" style={{ height: `${(d.lapses / maxHist) * 100}%` }} /> : null}
                </div>
              ))}
            </div>
          )}
          {p.overrides.length ? <p className="text-xs text-muted">Gate overrides used: {p.overrides.length} (latest {p.overrides.slice(-3).join(', ')})</p> : null}
        </Card>
        <Card className="space-y-2">
          <SectionTitle>Expected load, next 14 days</SectionTitle>
          <p className="text-xs text-muted">How many cards will come due each day if you keep going. Amber days exceed your daily cap.</p>
          {p.forecast.length === 0 ? <p className="text-sm text-muted">No active cards yet.</p> : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Forecast load per day for the next 14 days">
              {p.forecast.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.reviews} reviews, ~${d.minutes} min${d.debt ? `, ${d.debt} over the cap` : ''}`}>
                  <div className={`w-full rounded-t-sm ${d.debt > 0 ? 'bg-yellow-fg' : 'bg-green-fg'}`} style={{ height: `${((d.reviews + d.newCards) / maxLoad) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">Simulated at your retention target; real days will vary.</p>
        </Card>
      </div>

      {p.cost.byRole.length ? (
        <Card>
          <SectionTitle>Cost by tutor role (this month, all courses)</SectionTitle>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[32rem] text-xs">
              <thead><tr className="text-left font-medium text-muted"><th className="py-1.5">role</th><th>calls</th><th>input tokens</th><th>cache reads</th><th>output tokens</th><th>cost</th><th>avg latency</th></tr></thead>
              <tbody>
                {p.cost.byRole.map((r) => (
                  <tr key={r.role} className="border-t border-hairline"><td className="py-1.5">{r.role}</td><td>{r.calls}</td><td>{r.inputTokens}</td><td>{r.cacheRead}</td><td>{r.outputTokens}</td><td>{usd(r.costUsd)}</td><td>{Math.round(r.avgLatencyMs)} ms</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </Page>
  );
}
