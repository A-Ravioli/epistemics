import type { OutlineOutput } from '@epistemics/architect';
import { Button, Card, Field, inputClass } from '@epistemics/ui';

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
        {outline.description ? <p className="text-sm text-ink/70">{outline.description}</p> : null}
        {outline.assumedReferences.length ? (
          <div className="text-xs text-ink/60">
            <span className="font-medium">Assumed references (no sources supplied):</span>
            <ul className="mt-1 list-disc pl-5">{outline.assumedReferences.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ) : null}
      </Card>
      <ol className="space-y-3">
        {units.map((u, i) => (
          <li key={i}>
            <Card className="space-y-2" data-testid="outline-unit">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-xs text-ink/50">U{i + 1}</span>
                <input className={inputClass} value={u.title} onChange={(e) => setUnit(i, { title: e.target.value })} aria-label={`Unit ${i + 1} title`} data-testid={`unit-title-${i}`} />
                <Button variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move unit ${i + 1} up`} title="Move up">↑</Button>
                <Button variant="ghost" onClick={() => move(i, 1)} disabled={i === units.length - 1} aria-label={`Move unit ${i + 1} down`} title="Move down">↓</Button>
                <Button variant="ghost" onClick={() => dropUnit(i)} disabled={units.length <= 1} aria-label={`Drop unit ${i + 1}`} title="Drop unit">✕</Button>
              </div>
              {u.summary ? <p className="pl-8 text-xs text-ink/60">{u.summary}</p> : null}
              <ol className="space-y-1 pl-8">
                {u.lessons.map((l, k) => (
                  <li key={k} className="flex items-center gap-2" data-testid="outline-lesson">
                    <span className="w-8 shrink-0 text-xs text-ink/50">{i + 1}.{k + 1}</span>
                    <input className={inputClass} value={l.title} onChange={(e) => setLessonTitle(i, k, e.target.value)} aria-label={`Lesson ${i + 1}.${k + 1} title`} />
                    <Button variant="ghost" onClick={() => dropLesson(i, k)} disabled={u.lessons.length <= 1} aria-label={`Drop lesson ${i + 1}.${k + 1}`} title="Drop lesson">✕</Button>
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
