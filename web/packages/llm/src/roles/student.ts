/**
 * Teach-back student (DESIGN §3.6): a curious, slightly confused pupil who has read nothing.
 * One question per turn, ≤ 80 words, poses exactly one wrong belief when the state machine says so.
 */
import type { ChatMessage, Effort, LlmRequest } from '../provider.js';
import { PROMPTS } from '../prompts.js';

export interface StudentControl {
  /** Pose one plausible wrong belief this turn (once per session). */
  poseWrongBelief?: boolean;
  /** The belief to pose, typically a Misconception.description. Required when poseWrongBelief is true. */
  wrongBelief?: string;
  /** Ask the learner for a concrete example this turn. */
  askForExample?: boolean;
  /** Default 80. */
  maxWords?: number;
  /** Extra instruction from the state machine (e.g. "wrap up: thank them and ask one last check question"). */
  instruction?: string;
  turn?: number;
}

export interface StudentInput {
  conceptName: string;
  definition: string;
  objectives?: { id: string; text: string }[];
  /** learner = 'user', student = 'assistant'. */
  transcript: ChatMessage[];
  control?: StudentControl;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  metadata?: LlmRequest['metadata'];
  signal?: AbortSignal;
}

export function renderStudentControl(c: StudentControl): string {
  const maxWords = c.maxWords ?? 80;
  const kv = [
    ...(c.turn !== undefined ? [`turn=${c.turn}`] : []),
    `max_words=${maxWords}`,
    `pose_wrong_belief=${c.poseWrongBelief ? 'yes' : 'no'}`,
    `ask_for_example=${c.askForExample ? 'yes' : 'no'}`,
  ].join(' ');
  const lines = [kv];
  if (c.poseWrongBelief) {
    lines.push(c.wrongBelief
      ? `State this wrong belief as something you think, then ask whether it is right: "${c.wrongBelief.trim()}"`
      : 'State one plausible wrong belief about the concept as something you think, then ask whether it is right.');
  }
  if (c.askForExample) lines.push('Ask for a concrete example, or ask them to walk through one.');
  if (c.instruction) lines.push(c.instruction.trim());
  lines.push(`Exactly one question. At most ${maxWords} words. Do not explain or correct.`);
  return lines.join('\n');
}

/** The student never sees the reference material: only the concept's name and a one-line definition to stay on topic. */
function conceptNote(input: StudentInput): string {
  const lines = [`Topic the learner will teach you: ${input.conceptName.trim()}.`];
  lines.push(`(For staying on topic only, never to be repeated to the learner: ${input.definition.trim()})`);
  if (input.objectives && input.objectives.length > 0) {
    lines.push('What a complete explanation would cover (use it to pick what to ask about, not to say):');
    for (const o of input.objectives) lines.push(`- ${o.id}: ${o.text.trim()}`);
  }
  return lines.join('\n');
}

export function buildStudentRequest(input: StudentInput): LlmRequest {
  const opener: ChatMessage = { role: 'user', content: `[session] The learner will now teach you about "${input.conceptName.trim()}". Wait for them, then ask your questions.`, cache: true };
  const messages: ChatMessage[] = [
    opener,
    ...input.transcript.map((m) => ({ role: m.role, content: m.content })),
    { role: 'system', content: renderStudentControl(input.control ?? {}) },
  ];
  const req: LlmRequest = {
    role: 'student',
    system: [
      { text: PROMPTS.student, cache: true },
      { text: conceptNote(input), cache: true },
    ],
    messages,
    effort: input.effort ?? 'low',
  };
  if (input.maxTokens !== undefined) req.maxTokens = input.maxTokens;
  if (input.model) req.model = input.model;
  if (input.metadata) req.metadata = input.metadata;
  if (input.signal) req.signal = input.signal;
  return req;
}
