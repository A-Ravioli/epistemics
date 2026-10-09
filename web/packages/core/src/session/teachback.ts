/**
 * Teach-back session (DESIGN §3.6): the model plays a curious, slightly
 * confused student who has read nothing. Minimal pure reducer.
 */
import type { Concept, GradeResult, Rating } from '../types.js';

export const TEACHBACK_MAX_LEARNER_TURNS = 6;
export const TEACHBACK_MAX_WORDS = 80;
/** The student's wrong belief is posed on this student turn (1-based). */
export const TEACHBACK_WRONG_BELIEF_TURN = 3;

export type StudentMove = 'clarify' | 'wrong_belief' | 'example' | 'closing';

export interface StudentControl {
  conceptId: string;
  conceptName: string;
  move: StudentMove;
  turn: number;
  maxWords: number;
  instruction: string;
}

export interface TeachbackState {
  sessionId: string;
  courseId: string;
  conceptId: string;
  conceptName: string;
  /** The concept's `teachback` item id, or `<conceptId>#teachback` when it has none. */
  itemId: string;
  turns: { role: 'student' | 'learner'; content: string }[];
  learnerTurns: number;
  studentQuestionsAsked: number;
  wrongBeliefPosed: boolean;
  exampleAsked: boolean;
  started: boolean;
  grading: boolean;
  done: boolean;
}

export type TeachbackEvent =
  | { type: 'start' }
  | { type: 'learner_turn'; content: string; done?: boolean }
  | { type: 'student_turn'; content: string }
  | { type: 'end' }
  | { type: 'grade'; grade: GradeResult; rating: Rating };

export type TeachbackEffect =
  | { type: 'call_student'; control: StudentControl }
  | { type: 'grade_item'; itemKind: 'teachback'; itemId: string; conceptId: string; answer: string; assisted: false; rubricSource: 'item' }
  | { type: 'record_receipt'; itemKind: 'teachback'; itemId: string; conceptId: string; answer: string; grade: GradeResult; rating: Rating; assisted: false }
  | { type: 'teachback_complete'; conceptId: string; itemId: string; score: number; rating: Rating; learnerTurns: number };

export interface TeachbackStep {
  state: TeachbackState;
  effects: TeachbackEffect[];
}

export function createTeachbackState(input: { sessionId: string; courseId: string; concept: Concept }): TeachbackState {
  const item = input.concept.items.find((i) => i.type === 'teachback');
  return {
    sessionId: input.sessionId,
    courseId: input.courseId,
    conceptId: input.concept.id,
    conceptName: input.concept.name,
    itemId: item?.id ?? `${input.concept.id}#teachback`,
    turns: [],
    learnerTurns: 0,
    studentQuestionsAsked: 0,
    wrongBeliefPosed: false,
    exampleAsked: false,
    started: false,
    grading: false,
    done: false,
  };
}

const PERSONA =
  'You are a curious, slightly confused student who has read nothing about this topic and knows only its name. ' +
  'Never explain the concept yourself, never confirm whether the learner is right, and never look things up. ';

export function buildStudentControl(state: TeachbackState, move: StudentMove): StudentControl {
  const turn = state.studentQuestionsAsked + 1;
  const name = `"${state.conceptName}"`;
  let instruction: string;
  switch (move) {
    case 'clarify':
      instruction =
        `${PERSONA}The learner is teaching you ${name}. Ask exactly one clarifying question about something they just said ` +
        `(or, if this is the first turn, ask them to start explaining ${name} from the beginning). ≤${TEACHBACK_MAX_WORDS} words.`;
      break;
    case 'wrong_belief':
      instruction =
        `${PERSONA}The learner is teaching you ${name}. State exactly one plausible but wrong belief about it, as your own confused ` +
        `understanding ("so that means…?"), and ask them whether that is right. Do this only once; do not correct yourself. ≤${TEACHBACK_MAX_WORDS} words.`;
      break;
    case 'example':
      instruction =
        `${PERSONA}The learner is teaching you ${name}. Say you still find it abstract and ask them for one concrete example ` +
        `and how it works in that example. Ask exactly one question. ≤${TEACHBACK_MAX_WORDS} words.`;
      break;
    case 'closing':
      instruction =
        `${PERSONA}The learner has finished teaching you ${name}. Thank them in one or two sentences and say what you will remember. ` +
        `Do not ask a question. ≤${TEACHBACK_MAX_WORDS} words.`;
      break;
  }
  return { conceptId: state.conceptId, conceptName: state.conceptName, move, turn, maxWords: TEACHBACK_MAX_WORDS, instruction };
}

function nextMove(s: TeachbackState): StudentMove {
  const turn = s.studentQuestionsAsked + 1;
  if (!s.wrongBeliefPosed && turn >= TEACHBACK_WRONG_BELIEF_TURN) return 'wrong_belief';
  if (!s.exampleAsked && s.wrongBeliefPosed && turn >= TEACHBACK_WRONG_BELIEF_TURN + 1) return 'example';
  return 'clarify';
}

function studentEffect(s: TeachbackState, move: StudentMove): TeachbackEffect {
  const control = buildStudentControl(s, move);
  if (move !== 'closing') s.studentQuestionsAsked += 1;
  if (move === 'wrong_belief') s.wrongBeliefPosed = true;
  if (move === 'example') s.exampleAsked = true;
  return { type: 'call_student', control };
}

/** The learner's whole explanation, in order, as one text for the blind grader. */
export function learnerExplanation(state: TeachbackState): string {
  return state.turns
    .filter((t) => t.role === 'learner')
    .map((t) => t.content.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}

function beginGrading(s: TeachbackState, effects: TeachbackEffect[]): void {
  s.grading = true;
  effects.push({ type: 'grade_item', itemKind: 'teachback', itemId: s.itemId, conceptId: s.conceptId, answer: learnerExplanation(s), assisted: false, rubricSource: 'item' });
}

export function reduceTeachback(state: TeachbackState, event: TeachbackEvent): TeachbackStep {
  if (state.done) return { state, effects: [] };
  const s: TeachbackState = structuredClone(state);
  const effects: TeachbackEffect[] = [];

  switch (event.type) {
    case 'start': {
      if (s.started) return { state: s, effects: [] };
      s.started = true;
      effects.push(studentEffect(s, 'clarify'));
      return { state: s, effects };
    }
    case 'student_turn': {
      if (!s.started || s.grading) return { state: s, effects: [] };
      s.turns.push({ role: 'student', content: event.content });
      return { state: s, effects };
    }
    case 'learner_turn': {
      if (!s.started || s.grading) return { state: s, effects: [] };
      s.turns.push({ role: 'learner', content: event.content });
      s.learnerTurns += 1;
      if (event.done || s.learnerTurns >= TEACHBACK_MAX_LEARNER_TURNS) {
        effects.push(studentEffect(s, 'closing'));
        beginGrading(s, effects);
      } else {
        effects.push(studentEffect(s, nextMove(s)));
      }
      return { state: s, effects };
    }
    case 'end': {
      if (!s.started || s.grading) return { state: s, effects: [] };
      if (s.learnerTurns === 0) {
        s.done = true;
        return { state: s, effects };
      }
      beginGrading(s, effects);
      return { state: s, effects };
    }
    case 'grade': {
      if (!s.grading) return { state: s, effects: [] };
      s.done = true;
      effects.push({
        type: 'record_receipt',
        itemKind: 'teachback',
        itemId: s.itemId,
        conceptId: s.conceptId,
        answer: learnerExplanation(s),
        grade: event.grade,
        rating: event.rating,
        assisted: false,
      });
      effects.push({ type: 'teachback_complete', conceptId: s.conceptId, itemId: s.itemId, score: event.grade.score, rating: event.rating, learnerTurns: s.learnerTurns });
      return { state: s, effects };
    }
  }
}
