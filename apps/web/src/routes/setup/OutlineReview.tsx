import type { OutlineOutput } from '@epistemics/architect';
import { Card, Field, IconButton, inputClass } from '@epistemics/ui';

/**
 * Outline review (DESIGN §3.1 step 5): rename units and lessons, reorder units, drop lessons or units.
 * The edited outline is what the build uses, verbatim.
 */
export function OutlineReview({ outline, onChange }: { outline: OutlineOutput; onChange: (next: OutlineOutput) => void }) {
  const units = outline.units;
  const setUnit = (i: number, patch: Partial<OutlineOutput['units'][number]>) =>
    onChange({ ...outline, units: units.map((u, j) => (j === i ? { ...u, ...patch } : u)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= units.length) return;
    const next = [...units];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ ...outline, units: next });
  };
  const dropUnit = (i: number) => onChange({ ...outline, units: units.filter((_, j) => j !== i) });
  const dropLesson = (i: number, l: number) => setUnit(i, { lessons: units[i]!.lessons.filter((_, k) => k !== l) });
  const setLessonTitle = (i: number, l: number, title: string) =>
    setUnit(i, { lessons: units[i]!.lessons.map((x, k) => (k === l ? { ...x, title } : x)) });

  return (
    <div className="space-y-3" data-testid="outline-review">
      <Card className="space-y-3">
        <Field label="Course title">
          <input className={inputClass} value={outline.title} onChange={(e) => onChange({ ...outline, title: e.target.value })} data-testid="outline-title" />
        </Field>
        {outline.description ? <p className="text-sm leading-relaxed text-muted">{outline.description}</p> : null}
        {outline.assumedReferences.length ? (
          <div className="text-xs text-muted">
            <span className="font-medium">Assumed references (no sources supplied):</span>
            <ul className="mt-1 list-disc pl-5">{outline.assumedReferences.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ) : null}
      </Card>
      <ol className="space-y-3">
        {units.map((u, i) => (
          <li key={i}>
            <Card className="space-y-3" data-testid="outline-unit">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-xs font-medium text-muted">U{i + 1}</span>
                <input className={inputClass} value={u.title} onChange={(e) => setUnit(i, { title: e.target.value })} aria-label={`Unit ${i + 1} title`} data-testid={`unit-title-${i}`} />
                <span className="flex shrink-0 gap-1">
                  <IconButton size="sm" icon="chevron-up" onClick={() => move(i, -1)} disabled={i === 0} label={`Move unit ${i + 1} up`} />
                  <IconButton size="sm" icon="chevron-down" onClick={() => move(i, 1)} disabled={i === units.length - 1} label={`Move unit ${i + 1} down`} />
                  <IconButton size="sm" icon="x" onClick={() => dropUnit(i)} disabled={units.length <= 1} label={`Drop unit ${i + 1}`} />
                </span>
              </div>
              {u.summary ? <p className="pl-8 text-xs leading-relaxed text-muted">{u.summary}</p> : null}
              <ol className="space-y-1.5 pl-8">
                {u.lessons.map((l, k) => (
                  <li key={k} className="flex items-center gap-2" data-testid="outline-lesson">
                    <span className="w-8 shrink-0 text-xs text-muted">{i + 1}.{k + 1}</span>
                    <input className={inputClass} value={l.title} onChange={(e) => setLessonTitle(i, k, e.target.value)} aria-label={`Lesson ${i + 1}.${k + 1} title`} />
                    <IconButton size="sm" icon="x" onClick={() => dropLesson(i, k)} disabled={u.lessons.length <= 1} label={`Drop lesson ${i + 1}.${k + 1}`} />
                  </li>
                ))}
              </ol>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
