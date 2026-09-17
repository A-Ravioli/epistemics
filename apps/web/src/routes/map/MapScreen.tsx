import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { conceptDepths, type Concept, type ConceptState, type Receipt } from '@epistemics/core';
import { getCardsForConcept, getReceipts, listConceptStates } from '@epistemics/db';
import { Button, Card, Disclosure, ErrorBanner, IconButton, Page, PageHeader, PanelSection, Pill, Skeleton, Workspace } from '@epistemics/ui';
import { useCourse, useQuery } from '../../lib/app-state.js';
import { WIDE_QUERY, useMediaQuery } from '../../lib/use-media.js';
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

/** Pastel fill with a darker label for each mastery band; the not-started band is the neutral fill. */
function masteryTone(m: number): { bg: string; fg: string } {
  if (m >= 0.85) return { bg: 'var(--color-green-bg)', fg: 'var(--color-green-fg)' };
  if (m >= 0.6) return { bg: 'var(--color-lime-bg)', fg: 'var(--color-lime-fg)' };
  if (m >= 0.3) return { bg: 'var(--color-yellow-bg)', fg: 'var(--color-yellow-fg)' };
  if (m > 0) return { bg: 'var(--color-red-bg)', fg: 'var(--color-red-fg)' };
  return { bg: 'var(--color-fill)', fg: 'var(--color-muted)' };
}

const LEGEND = [
  { m: 0.9, label: 'mastered (85%+)' },
  { m: 0.7, label: 'developing (60-85%)' },
  { m: 0.4, label: 'shaky (under 60%)' },
  { m: 0.1, label: 'struggling' },
  { m: 0, label: 'not started' },
];

/** Prerequisite graph laid out in layers by depth (longest prerequisite chain). Colour = mastery. */
export function MapScreen() {
  const ctx = useCourse();
  const navigate = useNavigate();
  const wide = useMediaQuery(WIDE_QUERY);
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

  if (q.error) return <Page width="lg"><ErrorBanner title="Could not load the map" message={q.error} onRetry={q.refresh} /></Page>;
  if (!q.data) {
    return (
      <Page width="lg" data-testid="map-loading">
        <PageHeader title="Course map" />
        <Card><Skeleton lines={4} label="Drawing the map" /></Card>
      </Page>
    );
  }

  const sel = selected ? findConcept(ctx.curriculum, selected) : undefined;
  const nodeList = [...layout.nodes.values()];
  const detail = sel ? <ConceptDetail concept={sel.concept} state={q.data.states.find((s) => s.conceptId === sel.concept.id)} receipts={q.data.receipts.filter((r) => r.conceptId === sel.concept.id)} onClose={() => setSelected(undefined)} /> : null;
  const aside = (
    <div>
      {wide && detail ? detail : (
        <PanelSection title="Concept">
          <p className="text-[13px] leading-relaxed text-muted">Select a concept (click, or Tab to it and press Enter) to see its questions and your graded attempts here.</p>
        </PanelSection>
      )}
      <PanelSection title="Legend">
        <ul className="space-y-1.5 text-[13px] text-muted" aria-label="Legend">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-2"><i className="inline-block h-3.5 w-3.5 rounded-[4px] border border-hairline" style={{ background: masteryTone(l.m).bg }} aria-hidden="true" /> {l.label}</li>
          ))}
          <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-3.5 text-center">→</span> prerequisite</li>
        </ul>
      </PanelSection>
    </div>
  );
  return (
    <Workspace aside={aside} asideLabel="Map detail">
      <Page width="full" className="max-w-5xl">
      <PageHeader
        title="Course map"
        crumbs={[{ label: 'My courses', to: '/shelf' }, { label: ctx.course.title, to: '/today' }, { label: 'Map' }]}
        description="Every concept, arranged so prerequisites sit to the left of what they unlock. Colour shows how well you know each one."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setHideItems(!hideItems)} aria-pressed={hideItems} title="Hide the names and try to recall what each box is">{hideItems ? 'Show names' : 'Map from memory'}</Button>
            <IconButton icon="back" label="Back to Today" onClick={() => navigate('/today')} />
          </>
        }
      />
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted lg:hidden" aria-label="Legend">
        {LEGEND.map((l) => (
          <li key={l.label} className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px] border border-hairline" style={{ background: masteryTone(l.m).bg }} aria-hidden="true" /> {l.label}</li>
        ))}
        <li className="inline-flex items-center gap-1"><span aria-hidden="true">→</span> prerequisite</li>
      </ul>
      <div className="overflow-auto rounded-card border border-hairline bg-nested" tabIndex={0} aria-label="Prerequisite graph, scrollable">
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
              <rect width={W} height={H} rx={12} fill={masteryTone(n.mastery).bg} stroke={selected === n.id ? 'var(--color-ink)' : 'var(--color-hairline)'} strokeWidth={selected === n.id ? 1.5 : 1} />
              <text x={14} y={H / 2 + 4} fontSize={12} fontWeight={500} fill={n.mastery > 0 ? masteryTone(n.mastery).fg : 'var(--color-ink)'}>{hideItems ? `Concept ${n.depth}.${nodeList.filter((m) => m.depth === n.depth).indexOf(n) + 1}` : n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}</text>
              <text x={W - 10} y={H / 2 + 4} fontSize={10} textAnchor="end" fill={masteryTone(n.mastery).fg}>{Math.round(n.mastery * 100)}%</text>
            </g>
          ))}
        </svg>
      </div>
      {!wide ? (detail ?? <p className="text-sm text-muted">Select a concept (click, or Tab to it and press Enter) to see its questions and your graded attempts.</p>) : null}
      </Page>
    </Workspace>
  );
}

function ConceptDetail({ concept, state, receipts, onClose }: { concept: Concept; state?: ConceptState; receipts: Receipt[]; onClose: () => void }) {
  const ctx = useCourse();
  const cardsQ = useQuery(() => getCardsForConcept(ctx.db, ctx.course.id, concept.id), [concept.id]);
  const now = ctx.now();
  return (
    <div className="space-y-4" data-testid="concept-detail">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug">{concept.name}</h2>
          <p className="reading-sm mt-1.5 text-ink">{concept.definition}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
            <Pill tone={state && state.mastery >= 0.85 ? 'good' : 'neutral'} title="Retention × spaced-session progress; mastered at 85% with an 80% unaided pass rate">mastery {Math.round((state?.mastery ?? 0) * 100)}%</Pill>
            <Pill tone="neutral" title="Days on which you recalled this concept without help; three are needed">{state?.successfulSessions ?? 0} of 3 spaced recalls</Pill>
            {state?.unassistedN ? <Pill tone="neutral" title="Passes without help / attempts">unaided {state.unassistedPass}/{state.unassistedN}</Pill> : null}
            {state?.assistedN ? <Pill tone="neutral" title="Passes with the tutor's help / attempts">with help {state.assistedPass}/{state.assistedN}</Pill> : null}
            {state?.misconceptions.length ? <Pill tone="warn" title="Patterns the grader noticed in your misses">{state.misconceptions.join(', ')}</Pill> : null}
          </div>
        </div>
        <IconButton size="sm" icon="x" label="Close" onClick={onClose} />
      </div>
      <Link to={`/teachback/${concept.id}`} className="inline-block"><Button variant="secondary" size="sm">Teach it back</Button></Link>
      <Disclosure summary={`Questions (${concept.items.length})`}>
        {cardsQ.error ? <ErrorBanner message={cardsQ.error} onRetry={cardsQ.refresh} /> : null}
        <ul className="space-y-1 text-sm">
          {concept.items.map((i) => {
            const card = cardsQ.data?.find((c) => c.itemId === i.id);
            return (
              <li key={i.id} className="flex flex-col gap-1 border-t border-hairline py-2 first:border-t-0 first:pt-0">
                <span className="min-w-0"><Pill tone="purple">{i.type}</Pill> <span>{i.prompt.length > 120 ? `${i.prompt.slice(0, 119)}…` : i.prompt}</span></span>
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
              <li key={r.id} className="rounded-input bg-nested p-2.5">
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <Pill tone={r.rating >= 3 ? 'good' : r.rating === 2 ? 'warn' : 'bad'}>{['', 'Again', 'Hard', 'Good', 'Easy'][r.rating]}</Pill>
                  <span>{r.assisted ? 'with help' : 'unaided'}</span>
                  {r.confidence ? <span>confidence {['', 'guess', 'fairly sure', 'certain'][r.confidence]}</span> : null}
                  {r.disputed ? <span>disputed</span> : null}
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{r.answer || '(no answer)'}</p>
                {r.grade ? <p className="mt-1 text-xs text-muted">{r.grade.feedback}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </div>
  );
}
