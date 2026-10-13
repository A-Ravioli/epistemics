import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LedgerOptions {
  /** Daily budget in USD for each key. */
  budgetUsd: number;
  /** Optional JSON file to persist the ledger across restarts. */
  path?: string;
  /** Clock override for tests. */
  now?: () => Date;
}

interface LedgerFile {
  day: string;
  spent: Record<string, number>;
}

export const ANONYMOUS_KEY = 'anonymous';

/** UTC calendar day, `YYYY-MM-DD`. */
export function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the next UTC day, when every counter resets. */
export function nextResetAt(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/**
 * Per-key spend for the current UTC day. In memory, with optional JSON persistence so a
 * restart does not hand every user a fresh budget.
 */
export class BudgetLedger {
  readonly budgetUsd: number;
  private readonly path: string | undefined;
  private readonly now: () => Date;
  private day: string;
  private spentByKey = new Map<string, number>();

  constructor(opts: LedgerOptions) {
    this.budgetUsd = opts.budgetUsd;
    this.path = opts.path;
    this.now = opts.now ?? (() => new Date());
    this.day = dayOf(this.now());
    this.load();
  }

  private load(): void {
    if (!this.path) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<LedgerFile>;
      if (raw.day === this.day && raw.spent && typeof raw.spent === 'object') {
        for (const [k, v] of Object.entries(raw.spent)) {
          if (typeof v === 'number' && Number.isFinite(v)) this.spentByKey.set(k, v);
        }
      }
    } catch {
      // Missing or corrupt file: start empty. The next charge rewrites it.
    }
  }

  private save(): void {
    if (!this.path) return;
    const file: LedgerFile = { day: this.day, spent: Object.fromEntries(this.spentByKey) };
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(file, null, 2));
    } catch (err) {
      console.error(`[ledger] failed to persist ${this.path}:`, err);
    }
  }

  /** Drop all counters when the UTC day has rolled over. */
  private rollover(): void {
    const today = dayOf(this.now());
    if (today !== this.day) {
      this.day = today;
      this.spentByKey.clear();
      this.save();
    }
  }

  spent(key: string): number {
    this.rollover();
    return this.spentByKey.get(key) ?? 0;
  }

  remaining(key: string): number {
    return Math.max(0, this.budgetUsd - this.spent(key));
  }

  /** Whether a new request may start. Requests are admitted while any budget remains. */
  allows(key: string): boolean {
    return this.spent(key) < this.budgetUsd;
  }

  charge(key: string, usd: number): number {
    this.rollover();
    if (!(usd > 0)) return this.spentByKey.get(key) ?? 0;
    const total = (this.spentByKey.get(key) ?? 0) + usd;
    this.spentByKey.set(key, total);
    this.save();
    return total;
  }

  resetsAt(): Date {
    return nextResetAt(this.now());
  }

  snapshot(): LedgerFile {
    this.rollover();
    return { day: this.day, spent: Object.fromEntries(this.spentByKey) };
  }
}
