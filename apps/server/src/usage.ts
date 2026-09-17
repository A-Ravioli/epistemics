import { EMPTY_USAGE, type Usage } from './prices.ts';

type Json = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Overlay the usage fields present in `patch` onto `base`. The Messages API reports usage
 * cumulatively: `message_start` carries input/cache counts (and a small output count),
 * `message_delta` carries the final `output_tokens` and, on current models, the final input
 * counts too. Fields absent from a patch keep their previous value.
 */
export function mergeUsage(base: Usage, patch: unknown): Usage {
  if (!patch || typeof patch !== 'object') return base;
  const p = patch as Json;
  return {
    input_tokens: num(p.input_tokens) ?? base.input_tokens,
    output_tokens: num(p.output_tokens) ?? base.output_tokens,
    cache_read_input_tokens: num(p.cache_read_input_tokens) ?? base.cache_read_input_tokens,
    cache_creation_input_tokens: num(p.cache_creation_input_tokens) ?? base.cache_creation_input_tokens,
  };
}

export interface ParsedUsage {
  model?: string;
  usage: Usage;
  /** True once a `message_delta` or `message_stop` was seen, i.e. the usage is final. */
  complete: boolean;
}

/** Usage from a non-streaming `/v1/messages` JSON body. Returns undefined when the body has no usage (errors, count_tokens). */
export function usageFromJson(body: unknown): ParsedUsage | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Json;
  if (!b.usage || typeof b.usage !== 'object') return undefined;
  return {
    model: typeof b.model === 'string' ? b.model : undefined,
    usage: mergeUsage(EMPTY_USAGE, b.usage),
    complete: true,
  };
}

/**
 * Incremental SSE parser for the Messages streaming format. Feed it text chunks in any
 * split; it accumulates usage from `message_start` and `message_delta` events and ignores
 * everything else. Event boundaries are blank lines; a `data:` line holds the JSON payload.
 */
export class SseUsageParser {
  private buffer = '';
  private dataLines: string[] = [];
  readonly result: ParsedUsage = { usage: { ...EMPTY_USAGE }, complete: false };

  feed(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.line(line);
    }
  }

  /** Flush a trailing event that was not terminated by a blank line. */
  end(): ParsedUsage {
    if (this.buffer.length > 0) {
      this.line(this.buffer);
      this.buffer = '';
    }
    this.dispatch();
    return this.result;
  }

  private line(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive
    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // `event:` and `id:` lines are not needed: the JSON payload carries its own `type`.
  }

  private dispatch(): void {
    if (this.dataLines.length === 0) return;
    const data = this.dataLines.join('\n');
    this.dataLines = [];
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const ev = payload as Json;
    switch (ev.type) {
      case 'message_start': {
        const msg = ev.message as Json | undefined;
        if (msg) {
          if (typeof msg.model === 'string') this.result.model = msg.model;
          this.result.usage = mergeUsage(this.result.usage, msg.usage);
        }
        break;
      }
      case 'message_delta':
        this.result.usage = mergeUsage(this.result.usage, ev.usage);
        this.result.complete = true;
        break;
      case 'message_stop':
        this.result.complete = true;
        break;
      default:
        break;
    }
  }
}

/** Parse a whole SSE document at once (tests, or when the body was buffered anyway). */
export function usageFromSse(text: string): ParsedUsage {
  const p = new SseUsageParser();
  p.feed(text);
  return p.end();
}
