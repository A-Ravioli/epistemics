import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@epistemics/ui';

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

/** Match on the whole label, in order, so "prob" finds "Tiny Probability" and "tod" finds "Today". */
function matches(c: Command, q: string): boolean {
  if (!q) return true;
  return `${c.group} ${c.label}`.toLowerCase().includes(q.toLowerCase());
}

/**
 * The search field in the toolbar opens this: one list of everything you can go to — the screens, your
 * courses, the lessons of the course you are in. Arrow keys move, Enter goes, Escape closes.
 */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => commands.filter((c) => matches(c, q)).slice(0, 40), [commands, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      input.current?.focus();
    }
  }, [open]);
  useEffect(() => setI(0), [q]);

  if (!open) return null;

  const pick = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[12vh] backdrop-blur-[2px]" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="command-palette"
        className="w-full max-w-xl overflow-hidden rounded-card bg-surface shadow-window"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-hairline-soft px-4">
          <Icon name="search" className="text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to a screen, a course or a lesson"
            aria-label="Search"
            data-testid="palette-input"
            className="h-12 w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setI((n) => Math.min(n + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setI((n) => Math.max(n - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(hits[i]);
              }
            }}
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</p>
          ) : (
            hits.map((c, n) => (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setI(n)}
                onClick={() => pick(c)}
                aria-selected={n === i}
                className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-[background-color] duration-100 ${n === i ? 'bg-fill' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{c.label}</span>
                <span className="shrink-0 text-[12px] text-muted">{c.hint ?? c.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
