import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { conceptDepths, type Concept, type ConceptState, type Receipt } from '@epistemics/core';
import { getCardsForConcept, getReceipts, listConceptStates } from '@epistemics/db';
import { Button, Card, Disclosure, ErrorBanner, PageHeader, Pill, Skeleton } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { allConcepts, findConcept } from '../../lib/services/courses.js';
import { relativeDue } from '../../lib/format.js';

interface Node {
  id: string;
  name: string;
  depth: number;
  x: number;
  y: number;
  mastery: number;
  unit: string;
}

const W = 180;
const H = 44;
const GAP_X = 60;
const GAP_Y = 16;

function masteryColor(m: number): string {
  if (m >= 0.85) return '#059669';
  if (m >= 0.6) return '#65a30d';
  if (m >= 0.3) return '#d97706';
  if (m > 0) return '#dc2626';
  return 'var(--color-mist)';
}

const LEGEND = [
  { m: 0.9, label: 'mastered (85%+)' },
  { m: 0.7, label: 'developing (60-85%)' },
  { m: 0.4, label: 'shaky (under 60%)' },
  { m: 0, label: 'not started' },
];

/** Prerequisite graph laid out in layers by depth (longest prerequisite chain). Colour = mastery. */
export function MapScreen() {
  const ctx = useCourse();
  const [selected, setSelected] = useState<string | undefined>();
  const [hideItems, setHideItems] = useState(false);
  const q = useQuery(async () => ({ states: await listConceptStates(ctx.db, ctx.course.id), receipts: await getReceipts(ctx.db, ctx.course.id) }), [ctx.course.id]);

  const layout = useMemo(() => {
    const depths = conceptDepths(ctx.curriculum);
    const stateOf = new Map((q.data?.states ?? []).map((s) => [s.conceptId, s]));
    const byDepth = new Map<number, Node[]>();
    const nodes = new Map<string, Node>();
    for (const { concept, unitId } of allConcepts(ctx.curriculum)) {
      const d = depths[concept.id] ?? 0;
      const col = byDepth.get(d) ?? [];
      const node: Node = { id: concept.id, name: concept.name, depth: d, x: d * (W + GAP_X) + 10, y: col.length * (H + GAP_Y) + 10, mastery: stateOf.get(concept.id)?.mastery ?? 0, unit: unitId };
      col.push(node);
      byDepth.set(d, col);
      nodes.set(concept.id, node);
    }
    const maxCol = Math.max(1, ...[...byDepth.values()].map((c) => c.length));
    const maxDepth = Math.max(0, ...[...byDepth.keys()]);
    const edges = ctx.curriculum.edges.filter((e) => e.kind === 'prereq' && nodes.has(e.from) && nodes.has(e.to));
    const encompass = ctx.curriculum.edges.filter((e) => e.kind === 'encompasses' && nodes.has(e.from) && nodes.has(e.to));
    return { nodes, edges, encompass, width: (maxDepth + 1) * (W + GAP_X) + 20, height: maxCol * (H + GAP_Y) + 20 };
  }, [ctx.curriculum, q.data]);

  if (q.error) return <ErrorBanner title="Could not load the map" message={q.error} onRetry={q.refresh} />;
  if (!q.data) {
    return (
      <div className="space-y-4" data-testid="map-loading">
        <PageHeader title="Course map" />
        <Card><Skeleton lines={4} label="Drawing the map" /></Card>
      </div>
    );
  }

  const sel = selected ? findConcept(ctx.curriculum, selected) : undefined;
  const nodeList = [...layout.nodes.values()];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Course map"
        description="Every concept, arranged so prerequisites sit to the left of what they unlock. Colour shows how well you know each one."
        actions={<Button variant="secondary" size="sm" onClick={() => setHideItems(!hideItems)} aria-pressed={hideItems} title="Hide the names and try to recall what each box is">{hideItems ? 'Show names' : 'Map from memory'}</Button>}
      />
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.label} className="inline-flex items-center gap-1"><i className={`inline-block h-3 w-3 rounded-sm ${l.m === 0 ? 'border border-line' : ''}`} style={{ background: masteryColor(l.m) }} aria-hidden="true" /> {l.label}</li>
        ))}
        <li className="inline-flex items-center gap-1"><span aria-hidden="true">→</span> prerequisite</li>
      </ul>
      <div className="overflow-auto rounded-lg border border-line bg-paper" tabIndex={0} aria-label="Prerequisite graph, scrollable">
        <svg width={layout.width} height={layout.height} role="img" aria-label="Prerequisite graph" data-testid="map-svg">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" opacity="0.5" /></marker>
          </defs>
          {layout.encompass.map((e, i) => {
            const a = layout.nodes.get(e.from)!;
            const b = layout.nodes.get(e.to)!;
            return <line key={`en${i}`} x1={a.x + W / 2} y1={a.y + H / 2} x2={b.x + W / 2} y2={b.y + H / 2} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="4 4" />;
          })}
          {layout.edges.map((e, i) => {
            const a = layout.nodes.get(e.from)!;
            const b = layout.nodes.get(e.to)!;
            return <line key={`pr${i}`} x1={a.x + W} y1={a.y + H / 2} x2={b.x} y2={b.y + H / 2} stroke="currentColor" strokeOpacity={0.45} markerEnd="url(#arrow)" />;
          })}
          {nodeList.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => setSelected(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(n.id);
                }
              }}
              className="cursor-pointer focus:outline-none"
              role="button"
              tabIndex={0}
              aria-label={`${n.name}, mastery ${Math.round(n.mastery * 100)}%`}
              aria-pressed={selected === n.id}
              data-testid="map-node"
            >
              <rect width={W} height={H} rx={8} fill={masteryColor(n.mastery)} fillOpacity={n.mastery > 0 ? 0.25 : 1} stroke={selected === n.id ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth={selected === n.id ? 2 : 1} />
              <rect width={6} height={H} rx={3} fill={masteryColor(n.mastery)} />
              <text x={14} y={H / 2 + 4} fontSize={12} fill="currentColor">{hideItems ? `Concept ${n.depth}.${nodeList.filter((m) => m.depth === n.depth).indexOf(n) + 1}` : n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}</text>
              <text x={W - 8} y={H / 2 + 4} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.7}>{Math.round(n.mastery * 100)}%</text>
            </g>
          ))}
        </svg>
      </div>
      {sel ? <ConceptDetail concept={sel.concept} state={q.data.states.find((s) => s.conceptId === sel.concept.id)} receipts={q.data.receipts.filter((r) => r.conceptId === sel.concept.id)} onClose={() => setSelected(undefined)} /> : <p className="text-sm text-muted">Select a concept (click, or Tab to it and press Enter) to see its questions and your graded attempts.</p>}
    </div>
  );
}

function ConceptDetail({ concept, state, receipts, onClose }: { concept: Concept; state?: ConceptState; receipts: Receipt[]; onClose: () => void }) {
  const ctx = useCourse();
  const cardsQ = useQuery(() => getCardsForConcept(ctx.db, ctx.course.id, concept.id), [concept.id]);
  const now = ctx.now();
  return (
    <Card className="space-y-3" data-testid="concept-detail">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{concept.name}</h2>
          <p className="text-sm text-muted">{concept.definition}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Pill tone={state && state.mastery >= 0.85 ? 'good' : 'neutral'} title="Retention × spaced-session progress; mastered at 85% with an 80% unaided pass rate">mastery {Math.round((state?.mastery ?? 0) * 100)}%</Pill>
            <Pill tone="neutral" title="Days on which you recalled this concept without help; three are needed">{state?.successfulSessions ?? 0} of 3 spaced recalls</Pill>
            {state?.unassistedN ? <Pill tone="neutral" title="Passes without help / attempts">unaided {state.unassistedPass}/{state.unassistedN}</Pill> : null}
            {state?.assistedN ? <Pill tone="neutral" title="Passes with the tutor's help / attempts">with help {state.assistedPass}/{state.assistedN}</Pill> : null}
            {state?.misconceptions.length ? <Pill tone="warn" title="Patterns the grader noticed in your misses">{state.misconceptions.join(', ')}</Pill> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/teachback/${concept.id}`}><Button variant="secondary" size="sm">Teach it back</Button></Link>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
      <Disclosure summary={`Questions (${concept.items.length})`}>
        {cardsQ.error ? <ErrorBanner message={cardsQ.error} onRetry={cardsQ.refresh} /> : null}
        <ul className="space-y-1 text-sm">
          {concept.items.map((i) => {
            const card = cardsQ.data?.find((c) => c.itemId === i.id);
            return (
              <li key={i.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                <span className="min-w-0"><Pill tone="neutral">{i.type}</Pill> <span className="text-ink/80">{i.prompt.length > 120 ? `${i.prompt.slice(0, 119)}…` : i.prompt}</span></span>
                <span className="shrink-0 text-xs text-muted">{card ? (card.state === 0 ? 'not active yet' : `${['new', 'learning', 'review', 'relearning'][card.state]} · due ${relativeDue(card.due, now)} · ${Math.round(ctx.scheduler.retrievability(card, now) * 100)}% likely recalled`) : ''}</span>
              </li>
            );
          })}
        </ul>
      </Disclosure>
      <Disclosure summary={`Graded attempts (${receipts.length})`}>
        {receipts.length === 0 ? <p className="text-xs text-muted">No graded attempts yet.</p> : (
          <ul className="space-y-2 text-sm">
            {[...receipts].reverse().slice(0, 20).map((r) => (
              <li key={r.id} className="rounded-md border border-line p-2">
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <Pill tone={r.rating >= 3 ? 'good' : r.rating === 2 ? 'warn' : 'bad'}>{['', 'Again', 'Hard', 'Good', 'Easy'][r.rating]}</Pill>
                  <span>{r.assisted ? 'with help' : 'unaided'}</span>
                  {r.confidence ? <span>confidence {['', 'guess', 'fairly sure', 'certain'][r.confidence]}</span> : null}
                  {r.disputed ? <span>disputed</span> : null}
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-ink/80">{r.answer || '(no answer)'}</p>
                {r.grade ? <p className="mt-1 text-xs text-muted">{r.grade.feedback}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </Card>
  );
}
