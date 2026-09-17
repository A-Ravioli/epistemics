import type { OutlineOutput, ProgressEvent } from '@epistemics/architect';
import { Banner, Card, Pill, Progress, Spinner } from '@epistemics/ui';
import type { BuildProgress } from '../../lib/services/build.js';

const STAGE_LABEL: Record<ProgressEvent['stage'], string> = {
  outline: 'Outline', concepts: 'Concepts', graph: 'Prerequisite graph', validate: 'Graph check', scripts: 'Lesson script', items: 'Review items', itemcheck: 'Item self-check', freeze: 'Freeze',
};

export function describeEvent(e: ProgressEvent, outline?: OutlineOutput): string {
  const parts = [STAGE_LABEL[e.stage]];
  if (e.unit !== undefined) {
    const title = outline?.units[e.unit]?.title;
    parts.push(`unit ${e.unit + 1}${title ? ` (${title})` : ''}`);
  }
  if (e.lesson !== undefined) parts.push(`lesson ${(e.unit ?? 0) + 1}.${e.lesson + 1}`);
  if (e.concept) parts.push(e.concept);
  if (e.message) parts.push(e.message);
  return parts.join(' · ');
}

/** Build progress screen: stage / unit / lesson / concept from ProgressEvent; cached stages are shown as instant. */
export function BuildProgressView({ progress, outline, unitsToBuild, label }: { progress: BuildProgress; outline?: OutlineOutput; unitsToBuild: number; label?: string }) {
  const expected = expectedStages(outline, unitsToBuild);
  const finished = progress.done + progress.cached;
  const recent = progress.log.slice(-8).reverse();
  return (
    <Card className="space-y-3" data-testid="build-progress">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label ?? 'Building your course'}</h2>
        {progress.phase === 'building' || progress.phase === 'outlining' ? <Spinner label={progress.message ?? 'Working'} /> : null}
        {progress.phase === 'done' ? <Pill tone="good">Built</Pill> : null}
      </div>
      <Progress value={Math.min(finished, expected)} max={expected} />
      <div className="text-xs text-muted">
        {finished} of ~{expected} stages · {progress.cached} instant from cache
      </div>
      {progress.event ? (
        <div className="text-sm" data-testid="build-current">
          {progress.event.status === 'start' ? 'Now: ' : progress.event.status === 'cached' ? 'Instant: ' : 'Done: '}
          {describeEvent(progress.event, outline)}
        </div>
      ) : null}
      {recent.length ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {recent.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-2">
              <span className="w-14 shrink-0">{e.event.status === 'cached' ? 'instant' : e.event.status}</span>
              <span className="truncate">{describeEvent(e.event, outline)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {progress.error ? <Banner tone="bad" data-testid="build-error">{progress.error}</Banner> : null}
    </Card>
  );
}

/** Rough stage count for the progress bar: outline + per lesson concepts + graph + per concept (script, items, check) + freeze. */
export function expectedStages(outline: OutlineOutput | undefined, unitsToBuild: number): number {
  if (!outline) return 1;
  const units = outline.units.slice(0, unitsToBuild);
  const lessons = units.reduce((a, u) => a + u.lessons.length, 0);
  const concepts = lessons * 3;
  return 1 + lessons + 1 + concepts * 3 + 1;
}
