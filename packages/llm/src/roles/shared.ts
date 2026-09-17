/**
 * Conventions shared by the structured roles (observer, grader, leak check, warm-up):
 * the role's input is sent to the model as one fenced JSON block in the last user message.
 * The mock provider decodes the same block to produce deterministic answers.
 */
import type { ChatMessage, LlmRequest } from '../provider.js';

export function encodeInput(input: Record<string, unknown>): string {
  return '```json\n' + JSON.stringify(input, null, 2) + '\n```';
}

/** Parse the fenced JSON block of the last user message, if any. */
export function decodeInput<T = Record<string, unknown>>(req: LlmRequest): T | undefined {
  const last = [...req.messages].reverse().find((m: ChatMessage) => m.role === 'user');
  if (!last) return undefined;
  const m = /```json\s*([\s\S]*?)```/.exec(last.content);
  if (!m?.[1]) return undefined;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return undefined;
  }
}

/** Last message written by the learner (user role), or ''. */
export function lastUserText(req: LlmRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  return last?.content ?? '';
}

/** Last control message (system role inside messages), or ''. */
export function lastControlText(req: LlmRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'system');
  return last?.content ?? '';
}
