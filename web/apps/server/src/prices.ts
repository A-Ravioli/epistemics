/**
 * USD per million tokens, by model family. Matched by prefix so dated snapshots
 * (`claude-sonnet-5-20260401`) and aliases (`claude-sonnet-5`) price the same.
 * Unknown models fall back to the most expensive row so a typo can never bypass the budget.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export const FALLBACK_PRICE: ModelPrice = PRICES['claude-opus-5']!;

/** Longest matching prefix wins, so `claude-haiku-4-5` beats a hypothetical `claude-haiku-4`. */
export function priceFor(model: string | undefined): ModelPrice {
  if (!model) return FALLBACK_PRICE;
  const m = model.toLowerCase();
  let best: { key: string; price: ModelPrice } | undefined;
  for (const [key, price] of Object.entries(PRICES)) {
    if (m.startsWith(key) && (!best || key.length > best.key.length)) best = { key, price };
  }
  return best?.price ?? FALLBACK_PRICE;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export const EMPTY_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

export function costUsd(model: string | undefined, u: Usage): number {
  const p = priceFor(model);
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_input_tokens * p.cacheRead +
      u.cache_creation_input_tokens * p.cacheWrite) /
    1_000_000
  );
}
