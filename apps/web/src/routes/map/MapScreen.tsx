import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { conceptDepths, type Concept, type ConceptState, type Receipt } from '@epistemics/core';
import { getCardsForConcept, getReceipts, listConceptStates } from '@epistemics/db';
import { Banner, Button, Card, Disclosure, Pill, Spinner } from '@epistemics/ui';
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

  if (q.error) return <Banner tone="bad">{q.error}</Banner>;
  if (!q.data) return <Spinner label="Drawing the map" />;

  const sel = selected ? findConcept(ctx.curriculum, selected) : undefined;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Course map</h1>
        <div className="flex items-center gap-3 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: masteryColor(0.9) }} /> mastered</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: masteryColor(0.7) }} /> developing</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: masteryColor(0.4) }} /> shaky</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm border border-line" style={{ background: masteryColor(0) }} /> not started</span>
          <Button variant="ghost" onClick={() => setHideItems(!hideItems)}>{hideItems ? 'Show names' : 'Map from memory'}</Button>
        </div>
      </header>
      <div className="overflow-auto rounded-lg border border-line bg-paper">
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
          {[...layout.nodes.values()].map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} onClick={() => setSelected(n.id)} className="cursor-pointer" role="button" aria-label={n.name} data-testid="map-node">
              <rect width={W} height={H} rx={8} fill={masteryColor(n.mastery)} fillOpacity={n.mastery > 0 ? 0.25 : 1} stroke={selected === n.id ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth={selected === n.id ? 2 : 1} />
              <rect width={6} height={H} rx={3} fill={masteryColor(n.mastery)} />
              <text x={14} y={H / 2 + 4} fontSize={12} fill="currentColor">{hideItems ? `Concept ${n.depth}.${[...layout.nodes.values()].filter((m) => m.depth === n.depth).indexOf(n) + 1}` : n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}</text>
              <text x={W - 8} y={H / 2 + 4} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>{Math.round(n.mastery * 100)}%</text>
            </g>
          ))}
        </svg>
      </div>
      {sel ? <ConceptDetail concept={sel.concept} state={q.data.states.find((s) => s.conceptId === sel.concept.id)} receipts={q.data.receipts.filter((r) => r.conceptId === sel.concept.id)} onClose={() => setSelected(undefined)} /> : <p className="text-sm text-ink/60">Click a concept to see its items and receipts.</p>}
    </div>
  );
}

function ConceptDetail({ concept, state, receipts, onClose }: { concept: Concept; state?: ConceptState; receipts: Receipt[]; onClose: () => void }) {
  const ctx = useCourse();
  const cardsQ = useQuery(() => getCardsForConcept(ctx.db, ctx.course.id, concept.id), [concept.id]);
  const now = ctx.now();
  return (
    <Card className="space-y-3" data-testid="concept-detail">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{concept.name}</h2>
          <p className="text-sm text-ink/70">{concept.definition}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Pill tone={state && state.mastery >= 0.85 ? 'good' : 'neutral'}>mastery {Math.round((state?.mastery ?? 0) * 100)}%</Pill>
            <Pill tone="neutral">{state?.successfulSessions ?? 0} successful sessions</Pill>
            {state?.unassistedN ? <Pill tone="neutral">unassisted {state.unassistedPass}/{state.unassistedN}</Pill> : null}
            {state?.assistedN ? <Pill tone="neutral">assisted {state.assistedPass}/{state.assistedN}</Pill> : null}
            {state?.misconceptions.length ? <Pill tone="warn">{state.misconceptions.join(', ')}</Pill> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/teachback/${concept.id}`}><Button variant="secondary">Teach back</Button></Link>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      <Disclosure summary={`Items (${concept.items.length})`}>
        <ul className="space-y-1 text-sm">
          {concept.items.map((i) => {
            const card = cardsQ.data?.find((c) => c.itemId === i.id);
            return (
              <li key={i.id} className="flex items-start justify-between gap-2">
                <span><Pill tone="neutral">{i.type}</Pill> <span className="text-ink/80">{i.prompt.length > 120 ? `${i.prompt.slice(0, 119)}…` : i.prompt}</span></span>
                <span className="shrink-0 text-xs text-ink/50">{card ? (card.state === 0 ? 'not active' : `${['new', 'learning', 'review', 'relearning'][card.state]} · ${relativeDue(card.due, now)} · R ${ctx.scheduler.retrievability(card, now).toFixed(2)}`) : ''}</span>
              </li>
            );
          })}
        </ul>
      </Disclosure>
      <Disclosure summary={`Receipts (${receipts.length})`}>
        {receipts.length === 0 ? <p className="text-xs text-ink/60">No graded attempts yet.</p> : (
          <ul className="space-y-2 text-sm">
            {[...receipts].reverse().slice(0, 20).map((r) => (
              <li key={r.id} className="rounded-md border border-line p-2">
                <div className="flex flex-wrap gap-2 text-xs text-ink/60">
                  <Pill tone={r.rating >= 3 ? 'good' : r.rating === 2 ? 'warn' : 'bad'}>{['', 'Again', 'Hard', 'Good', 'Easy'][r.rating]}</Pill>
                  <span>{r.assisted ? 'assisted' : 'unassisted'}</span>
                  {r.confidence ? <span>confidence {r.confidence}</span> : null}
                  {r.disputed ? <span>disputed</span> : null}
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ink/80">{r.answer || '(no answer)'}</p>
                {r.grade ? <p className="mt-1 text-xs text-ink/60">{r.grade.feedback}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </Card>
  );
}
