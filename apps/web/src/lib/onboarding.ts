/**
 * First-run state (docs/ONBOARDING.md).
 *
 * Two facts with different scopes live here. Whether this learner has been through onboarding and has a
 * course belongs to the account, so it is a row in `settings` and syncs; whether *this device* has a tutor
 * belongs to the device, because the API key does. Both are mirrored into `localStorage`, which is what the
 * boot redirect in App.tsx reads, because that answer is needed synchronously.
 */
import type { CourseGoals, CourseSettings, Curriculum } from '@epistemics/core';
import type { Db } from '@epistemics/db';
import { getSetting, setSetting } from '@epistemics/db';
import { KEYS } from './settings.js';

/** The device-local mirror of "this device has been through the flow", so the boot redirect stays sync. */
const MIRROR = 'epistemics:onboarded';
/** Device-local: a tutor was chosen *here*. The LLM settings sync but the API key does not, so a second
 *  device must be asked again even though the mode it pulled says "anthropic". */
const TUTOR_MIRROR = 'epistemics:tutor-device';

export type OnboardingSource = 'pack' | 'subject' | 'material';
export type MinutesPerDay = 10 | 20 | 40;

export interface OnboardingSourceRef {
  id: string;
  title: string;
}

/**
 * What the flow has collected so far. Written after every step so a reload resumes rather than restarts —
 * the curriculum build is the longest thing in the flow and the most annoying to lose.
 */
export interface OnboardingDraft {
  source: OnboardingSource;
  /** Pack path: the curriculum to enrol in. */
  packId?: string;
  packVersion?: number;
  /** Subject and material paths: what to build. */
  subject?: string;
  level?: string;
  sources?: OnboardingSourceRef[];
  /** Step 2: what the learner recalled, verbatim. Becomes `CourseGoals.background`. */
  recall?: string;
  /** Step 4. */
  minutesPerDay?: MinutesPerDay;
  purpose?: CourseGoals['purpose'];
  /** "YYYY-MM-DD" as typed; converted to a timestamp at enrolment. */
  examDate?: string;
  /** Set once a course exists, which is what "onboarded" actually means. */
  completedAt?: number;
  /** The learner chose the demo tutor or skipped the step; Today carries the unfinished business. */
  tutorDeferred?: boolean;
  /** Accepted the placement offer made at step 2, once the recall earned it. */
  placement?: boolean;
}

export const DEFAULT_LEVEL = 'intro undergraduate';
export const DEFAULT_MINUTES: MinutesPerDay = 20;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function getOnboarding(db: Db): Promise<OnboardingDraft | undefined> {
  return getSetting<OnboardingDraft>(db, KEYS.onboarding);
}

export async function patchOnboarding(db: Db, patch: Partial<OnboardingDraft>): Promise<OnboardingDraft> {
  const next = { ...((await getOnboarding(db)) ?? { source: 'pack' as const }), ...patch };
  await setSetting(db, KEYS.onboarding, next);
  return next;
}

export async function clearOnboarding(db: Db): Promise<void> {
  await setSetting(db, KEYS.onboarding, null);
}

/** Record that a course now exists, and mirror it so the next boot goes straight to Today. */
export async function markOnboardingComplete(db: Db, now: number = Date.now()): Promise<void> {
  await patchOnboarding(db, { completedAt: now });
  setMirror(true);
}

export function setMirror(done: boolean): void {
  try {
    if (done) localStorage.setItem(MIRROR, '1');
    else localStorage.removeItem(MIRROR);
  } catch {
    /* ignore */
  }
}

/**
 * The synchronous answer the boot redirect needs. It fails open: with no storage at all nobody is trapped
 * on the welcome screen (ONBOARDING §7.5). The authoritative record is in the database, and the flow
 * itself reconciles the two on mount — a second device that pulled a synced course skips ahead.
 */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(MIRROR) === '1';
  } catch {
    return true;
  }
}

/** Whether a tutor has been chosen on this device (ONBOARDING §6). */
export function tutorChosenHere(): boolean {
  try {
    return localStorage.getItem(TUTOR_MIRROR) === '1';
  } catch {
    return true; // no storage: never ask twice for something that cannot be remembered
  }
}

/**
 * Whether this device still owes an answer about the tutor. A device that has been through any first run
 * has been asked already (including the provider-only screen this flow replaced), so the question is only
 * put again where it is genuinely unanswered: a fresh device, typically one that pulled a course over sync.
 */
export function needsTutorHere(): boolean {
  return !tutorChosenHere() && !isOnboarded();
}

export function setTutorChosenHere(chosen: boolean): void {
  try {
    if (chosen) localStorage.setItem(TUTOR_MIRROR, '1');
    else localStorage.removeItem(TUTOR_MIRROR);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type StepId = 'subject' | 'recall' | 'tutor' | 'commitment';

export const STEP_LABELS: Record<StepId, string> = {
  subject: 'Subject',
  recall: 'What you know',
  tutor: 'Tutor',
  commitment: 'Time',
};

/**
 * Which steps this learner actually sees (ONBOARDING §3). Someone who only needs a second course is not
 * asked about a tutor again; a second device that pulled a synced course is asked about nothing else,
 * because the key is the one answer that really is device-local.
 */
export function stepsFor({ needsCourse, needsTutor }: { needsCourse: boolean; needsTutor: boolean }): StepId[] {
  const steps: StepId[] = [];
  if (needsCourse) steps.push('subject', 'recall');
  if (needsTutor) steps.push('tutor');
  if (needsCourse) steps.push('commitment');
  return steps;
}

// ---------------------------------------------------------------------------
// Derivations (ONBOARDING §5)
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * One answer — minutes a day — sets the whole review load. `reviewsPerDay` is a *cap*, not a target: it is
 * where due cards start becoming debt (DESIGN §5.4), so the honest number is what the learner could clear
 * in a session of nothing but reviews, at roughly 20 seconds a card.
 */
export function schedulingFor(minutesPerDay: number): Pick<CourseSettings, 'reviewsPerDay' | 'desiredRetention'> & { weeklyMinutes: number } {
  return {
    weeklyMinutes: minutesPerDay * 7,
    reviewsPerDay: clamp(Math.round(minutesPerDay * 3), 20, 400),
    desiredRetention: 0.9,
  };
}

/** The goals the draft implies. The recall text is the background, written by recalling rather than rating. */
export function goalsFor(draft: OnboardingDraft): CourseGoals {
  const minutes = draft.minutesPerDay ?? DEFAULT_MINUTES;
  const goals: CourseGoals = { purpose: draft.purpose ?? 'understand', weeklyMinutes: schedulingFor(minutes).weeklyMinutes };
  const background = draft.recall?.trim();
  if (background) goals.background = background;
  if (goals.purpose === 'exam' && draft.examDate) goals.examDate = new Date(`${draft.examDate}T12:00:00`).getTime();
  return goals;
}

// ---------------------------------------------------------------------------
// The reflection (ONBOARDING §3, step 2)
// ---------------------------------------------------------------------------

/** Words too common to mean anything when they collide; matching on these would flatter the learner. */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'when', 'what', 'which', 'their',
  'there', 'have', 'has', 'was', 'were', 'are', 'not', 'but', 'its', 'some', 'more', 'than', 'then',
  'they', 'them', 'you', 'your', 'can', 'will', 'how', 'why', 'all', 'any', 'one', 'two', 'value', 'values',
  'rule', 'rules', 'law', 'laws', 'basic', 'basics', 'theory', 'general', 'simple', 'problem', 'problems',
]);

const words = (s: string): string[] => s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];

/**
 * Which of a curriculum's concepts the learner just named, matched mechanically. No model call: at this
 * point in the flow no tutor has been chosen, and the reflection has to work offline and instantly.
 *
 * A concept counts as named when its full name appears in the text, or when every distinctive word of its
 * name does. Matching a single shared word ("distribution") would flatter the learner, and the reflection
 * is only worth showing if it is true.
 */
export function conceptsNamed(curriculum: Curriculum, recall: string, limit = 4): string[] {
  const text = recall.toLowerCase();
  if (text.trim().length < 3) return [];
  const bag = new Set(words(text));
  const hits: string[] = [];
  for (const unit of curriculum.units) {
    for (const lesson of unit.lessons) {
      for (const concept of lesson.concepts) {
        const name = concept.name;
        const distinctive = words(name).filter((w) => !STOP.has(w));
        const named = text.includes(name.toLowerCase()) || (distinctive.length > 0 && distinctive.every((w) => bag.has(w)));
        if (named && !hits.includes(name)) hits.push(name);
      }
    }
  }
  return hits.slice(0, limit);
}

/**
 * Whether the recall earned the placement offer (ONBOARDING §3, step 5). A named concept is the strong
 * signal; a substantial paragraph is the weak one, for a subject course where there is nothing to match
 * against yet.
 */
export function shouldOfferPlacement(recall: string | undefined, named: string[]): boolean {
  if (named.length >= 2) return true;
  return (recall?.trim().length ?? 0) >= 120;
}
