export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function minutes(n: number): string {
  return n === 1 ? '1 min' : `${n} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function usd(x: number): string {
  return x < 0.01 && x > 0 ? '<$0.01' : `$${x.toFixed(2)}`;
}

export function dateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relativeDue(due: number, now: number): string {
  const diff = due - now;
  const abs = Math.abs(diff);
  const unit = abs < 3_600_000 ? [Math.round(abs / 60_000), 'min'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'd'];
  return diff < 0 ? `${unit[0]}${unit[1]} overdue` : `in ${unit[0]}${unit[1]}`;
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
