import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * README screenshots, opt-in: EPISTEMICS_SCREENSHOTS=1 pnpm --filter @epistemics/web e2e screenshots
 *
 * Drives the bundled probability pack through the first run, a lesson, a review, the map, progress and a
 * teach-back with the demo tutor, saving PNGs to docs/screenshots/web/ at the repository root. Skipped
 * unless EPISTEMICS_SCREENSHOTS is set, so CI and the normal e2e run never touch it.
 */

const OUT = fileURLToPath(new URL('../../../../docs/screenshots/web/', import.meta.url));

test.skip(!process.env['EPISTEMICS_SCREENSHOTS'], 'set EPISTEMICS_SCREENSHOTS=1 to regenerate the README screenshots');

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });

/** Fonts loaded, no running finite animations, no loading skeletons, pointer parked away from anything hoverable. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(1439, 899);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), undefined, { timeout: 5_000 })
    .catch(() => undefined);
  await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `${OUT}${name}`, animations: 'disabled', caret: 'hide' });
}

// ---------------------------------------------------------------------------------------------------------
// What a learner would plausibly type, per concept of the first lesson and per phase.

type Phase = 'PRIME' | 'PROBE' | 'DEVELOP' | 'CONSOLIDATE' | 'EXTEND' | 'CHECK' | 'REMEDIATE';

const LESSON_ANSWERS: Record<string, Partial<Record<Phase, string[]>>> = {
  'Sample spaces and events': {
    PRIME: ['S = {HH, HT, TH, TT}. Exactly one head is {HT, TH}, so two of the four outcomes.'],
    PROBE: ['I remember the sample space is the list of everything that can happen, and an event is some of those outcomes, like "at least one head".'],
    DEVELOP: [
      'HH, HT, TH, TT. I treat the first and second flip separately so HT and TH are different outcomes.',
      'The sample space is the set of all possible outcomes, and an event is a subset of it; the event occurs when the actual outcome lies in that subset.',
    ],
    CONSOLIDATE: ['The sample space is the set of all possible outcomes of the experiment. An event is a subset of the sample space, and it occurs when the outcome lies in it.'],
    EXTEND: ['Eight outcomes: O+, O−, A+, A−, B+, B−, AB+, AB−. The event is {O+, O−, A−, B−, AB−}: all four Rh-negative types plus O+.'],
    CHECK: ['S = {HH, HT, TH, TT}; the event exactly one head is the subset {HT, TH}.'],
    REMEDIATE: ['The sample space is every possible outcome, listed in order; an event is the subset of outcomes that make the statement true.'],
  },
  'Probability from equally likely outcomes': {
    PRIME: ['36 ordered pairs, and six of them sum to 7, so 6/36 = 1/6.'],
    PROBE: ['I know it is favourable over total, as long as every outcome is equally likely.'],
    DEVELOP: [
      '36 ordered pairs (first die, second die), and they are all equally likely.',
      'When every outcome is equally likely, the probability of an event is the number of outcomes in the event divided by the total number of outcomes: P(A) = |A| / |S|.',
    ],
    CONSOLIDATE: ['P(A) = |A| / |S|: the number of outcomes in the event divided by the total number of outcomes, which only works when all outcomes are equally likely.'],
    EXTEND: ['3/12 = 1/4, assuming each of the 12 charts is equally likely to be chosen.'],
    CHECK: ['Six of the 36 equally likely ordered pairs sum to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1). So 6/36 = 1/6.'],
    REMEDIATE: ['Count the outcomes in the event and divide by the total number of equally likely outcomes.'],
  },
  'The complement rule': {
    PRIME: ['Easier to go through "no sixes": (5/6)^4 ≈ 0.48, so at least one six is 1 − 0.48 ≈ 0.52.'],
    PROBE: ['I remember that P(not A) = 1 − P(A), and that "at least one" is usually easiest through "none".'],
    DEVELOP: [
      'The complement of at least one six is no six at all in the four rolls.',
      'The complement of A is "A does not occur"; exactly one of A and its complement happens, so P(A^c) = 1 − P(A). That is the route to "at least one" probabilities.',
    ],
    CONSOLIDATE: ['P(A^c) = 1 − P(A), because A and its complement are disjoint and together make up the whole sample space. The complement of "at least one" is "none at all".'],
    EXTEND: ['No rain on any day is 0.7^3 = 0.343, so rain on at least one day is 1 − 0.343 = 0.657.'],
    CHECK: ['P(no six in 4 rolls) = (5/6)^4 = 625/1296, so P(at least one six) = 1 − 625/1296 = 671/1296 ≈ 0.518.'],
    REMEDIATE: ['Take the complement, "none at all", compute that, and subtract it from 1.'],
  },
};

const SUMMARY =
  'A probability is always a probability of an event, which is a subset of the sample space of all possible outcomes. When the outcomes are equally likely, P(A) is the number of outcomes in A over the total. For "at least one" questions it is easier to compute the complement, "none", and subtract from 1, because an event and its complement cover the sample space without overlapping.';

const REVIEW_ANSWERS: [RegExp, string][] = [
  [/beginner:\s*\**Sample spaces and events/i, 'The sample space is the complete list of everything that could happen, and an event is a subset of it. Flip two coins: S = {HH, HT, TH, TT}, and "exactly one head" is the event {HT, TH}. Keep HT and TH apart so the outcomes stay equally likely.'],
  [/beginner:\s*\**Probability from equally likely outcomes/i, 'When every outcome is equally likely, probability is counting: outcomes in the event divided by the total number of outcomes. Two dice give 36 ordered pairs and six of them sum to 7, so P(sum 7) = 6/36 = 1/6.'],
  [/beginner:\s*\**The complement rule/i, 'An event and its complement cannot both happen and one of them must, so P(not A) = 1 − P(A). For "at least one six in four rolls", compute P(no six) = (5/6)^4 ≈ 0.48 and subtract: about 0.52.'],
  [/What is a sample space, and what is an event/i, 'The sample space is the set of all possible outcomes of an experiment. An event is a subset of the sample space; it occurs when the outcome that actually happens is in that subset.'],
  [/two flips of a coin the sample space has/i, '4 outcomes; 3 of them (HT, TH, TT).'],
  [/HT and TH as separate outcomes/i, 'HT and TH are different sequences: in HT the first coin is heads and in TH it is tails. Listing them separately gives four equally likely outcomes, so counting works.'],
  [/sum of the two rolls is 7/i, 'The sample space is 6 × 6 = 36 ordered pairs. The sum is 7 for (1,6), (2,5), (3,4), (4,3), (5,2), (6,1), so 6 outcomes. Answers: 36, 6.'],
  [/quality inspector checks 4 items/i, 'Exactly one F: {FPPP, PFPP, PPFP, PPPF}, which is 4 outcomes out of 2^4 = 16 in the sample space.'],
  [/formula for the probability of an event when all outcomes are equally likely/i, 'P(A) = |A| / |S|, the number of outcomes in A divided by the total number of outcomes. It only holds when all outcomes in the sample space are equally likely.'],
  [/sum is at least 10/i, 'Sum 10: (4,6), (5,5), (6,4); sum 11: (5,6), (6,5); sum 12: (6,6). That is 6 of the 36 outcomes, so 6/36 = 1/6.'],
  [/40 microchips/i, '34 of the 40 chips are not defective and each chip is equally likely to be picked, so 34/40 = 17/20 = 0.85.'],
  [/two heads, one head, or no heads/i, 'Those three results are not equally likely. The equally likely outcomes are HH, HT, TH, TT, and "one head" covers two of them, so P(two heads) = 1/4, not 1/3.'],
  [/sum of 6 or a sum of 9/i, 'Sum 6 comes from (1,5), (2,4), (3,3), (4,2), (5,1): 5 ways. Sum 9 from (3,6), (4,5), (5,4), (6,3): 4 ways. So 6 is more likely, 5/36 against 4/36.'],
  [/State the complement rule/i, 'P(A^c) = 1 − P(A), because A and its complement are disjoint and together make up the whole sample space. The complement of "at least one" is "none at all".'],
  [/flipped 6 times.*at least one tail/i, 'P(no tails) = P(all heads) = (1/2)^6 = 1/64, so P(at least one tail) = 1 − 1/64 = 63/64 ≈ 0.984.'],
  [/5 sensors/i, 'P(no sensor fails) = 0.9^5 = 0.59049, so P(at least one fails) = 1 − 0.59049 = 0.40951, about 0.4095.'],
  [/not \$?4 \\?times/i, 'Adding 1/6 four times double-counts outcomes with two or more sixes, and with 7 rolls it would exceed 1. Instead compute P(no six) = (5/6)^4 and take 1 minus that.'],
  [/P\(A\) = 0\.35/i, '0.65; mutually exclusive (disjoint); exhaustive.'],
];

function reviewAnswerFor(prompt: string): string {
  return REVIEW_ANSWERS.find(([re]) => re.test(prompt))?.[1] ?? 'The sample space is the set of all possible outcomes; count the outcomes in the event and divide by the total when they are equally likely.';
}

// ---------------------------------------------------------------------------------------------------------

async function currentPhase(page: Page): Promise<string> {
  return (await page.getByTestId('phase-indicator').getAttribute('data-phase')) ?? '';
}

async function currentConcept(page: Page): Promise<string> {
  const header = await page.getByTestId('lesson-header').innerText();
  return Object.keys(LESSON_ANSWERS).find((name) => header.includes(name)) ?? Object.keys(LESSON_ANSWERS)[0]!;
}

/** Type (but do not send) the next answer for the current phase, choosing a confidence when the phase asks for one. */
async function typeAnswer(page: Page, used: Map<string, number>): Promise<void> {
  const phase = (await currentPhase(page)) as Phase;
  const concept = await currentConcept(page);
  const key = `${concept}/${phase}`;
  const n = used.get(key) ?? 0;
  used.set(key, n + 1);
  const options = LESSON_ANSWERS[concept]?.[phase] ?? [LESSON_ANSWERS[concept]!.CONSOLIDATE![0]!];
  const text = options[Math.min(n, options.length - 1)]!;
  await page.getByTestId('lesson-input').fill(text);
  if (await page.getByTestId('send').isDisabled()) await page.getByRole('button', { name: phase === 'CHECK' ? 'Certain' : 'Fairly sure' }).click();
}

async function inputReady(page: Page): Promise<'input' | 'wrap' | 'done'> {
  const input = page.getByTestId('lesson-input');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await page.getByTestId('lesson-done').count()) return 'done';
    if (await page.getByTestId('wrap-summary').count()) return 'wrap';
    if (await input.isEnabled({ timeout: 250 }).catch(() => false)) return 'input';
    await page.waitForTimeout(150);
  }
  throw new Error('the lesson stopped accepting input');
}

/** Drive the lesson to its end; `onTurn` sees the screen before each answer is sent. */
async function driveLesson(page: Page, onTurn: (turn: number, phase: string) => Promise<void>): Promise<void> {
  const used = new Map<string, number>();
  for (let turn = 0; turn < 80; turn++) {
    const state = await inputReady(page);
    if (state === 'done') return;
    if (state === 'wrap') {
      await page.getByTestId('summary-input').fill(SUMMARY);
      await page.getByTestId('submit-summary').click();
      await expect(page.getByTestId('wrap-jol')).toBeVisible();
      await expect(page.getByTestId('submit-jol')).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId('submit-jol').click();
      await expect(page.getByTestId('lesson-done')).toBeVisible({ timeout: 30_000 });
      return;
    }
    const phase = await currentPhase(page);
    await typeAnswer(page, used);
    await onTurn(turn, phase);
    await page.getByTestId('send').click();
    await expect(page.getByTestId('lesson-input')).toBeDisabled().catch(() => undefined);
  }
  throw new Error('lesson did not finish in 80 turns');
}

async function clickFirst(...locators: Locator[]): Promise<void> {
  for (const l of locators) if (await l.count()) return l.first().click();
  throw new Error('nothing to click');
}

test('README screenshots', async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });

  await test.step('first run: subject', async () => {
    await page.goto('/');
    await expect(page.getByTestId('step-subject')).toBeVisible();
    const pack = page.getByTestId('onboarding-pack').first();
    await expect(pack).toBeVisible({ timeout: 30_000 });
    await pack.click();
    await shoot(page, 'first-run.png');
    await page.getByTestId('onboarding-next').click();
  });

  await test.step('first run: recall, tutor, time', async () => {
    await expect(page.getByTestId('step-recall')).toBeVisible();
    await page.getByTestId('recall-input').fill('Probability is favourable outcomes over total outcomes when they are equally likely. I remember the complement rule, P(not A) = 1 − P(A), and a bit of counting with combinations from school.');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('step-reflection')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('step-tutor')).toBeVisible();
    await page.getByTestId('welcome-tutor').getByText('The demo tutor', { exact: true }).click();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('step-commitment')).toBeVisible();
    await page.getByRole('button', { name: /20 min/ }).click();
    await page.getByTestId('onboarding-finish').click();
    await expect(page.getByTestId('next-up')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('start-lesson')).toBeVisible();
  });

  await test.step('lesson', async () => {
    await page.getByTestId('start-lesson').click();
    await expect(page.getByTestId('lesson-screen')).toBeVisible();
    let shot = false;
    await driveLesson(page, async (turn, phase) => {
      if (!shot && phase === 'DEVELOP') {
        shot = true;
        await shoot(page, 'lesson.png');
      }
    });
    await page.getByTestId('back-to-today').click();
  });

  await test.step('today with reviews due', async () => {
    await expect(page.getByTestId('review-summary').first()).toContainText('due', { timeout: 15_000 });
    await shoot(page, 'today.png');
  });

  await test.step('review receipt, then clear the queue', async () => {
    await clickFirst(page.getByTestId('start-reviews'), page.getByRole('link', { name: /review/i }));
    await expect(page.getByTestId('review-screen')).toBeVisible();
    const progress = page.getByTestId('review-progress');
    const cleared = page.getByTestId('reviews-cleared');
    // the cards due when the session opened; learning cards can come due again minutes later, which is not the point here
    const due = Number((await progress.innerText()).match(/of (\d+)/)?.[1] ?? 1);
    let shot = false;
    for (let i = 0; i < Math.max(due, 1) + 5 && !(await cleared.count()) && (i < due || !shot); i++) {
      await expect(page.getByTestId('review-answer').or(cleared).first()).toBeVisible({ timeout: 15_000 });
      if (await cleared.count()) break;
      const before = await progress.innerText();
      const prompt = await page.locator('[data-testid="review-screen"] .reading').first().innerText();
      if (await page.getByTestId('review-continue').isEnabled()) {
        // self-graded: recall, reveal, rate
        await page.getByTestId('review-continue').click();
        await page.getByRole('button', { name: 'Fairly sure' }).click();
        await page.getByTestId('show-answer').click();
        await page.getByRole('button', { name: /Good/ }).click();
      } else {
        await page.getByTestId('review-answer').fill(reviewAnswerFor(prompt));
        await page.getByTestId('review-continue').click();
        await page.getByRole('button', { name: 'Fairly sure' }).click();
        await page.getByTestId('grade-answer').click();
        await expect(page.getByTestId('grade-receipt')).toBeVisible({ timeout: 30_000 });
        // prefer a short-answer card, whose receipt fits the window; a teach-back receipt only as the last resort
        const teachback = /beginner/i.test(prompt);
        if (!shot && (!teachback || i >= due - 1)) {
          shot = true;
          if (!teachback) await page.getByTestId('accept-grade').scrollIntoViewIfNeeded();
          await shoot(page, 'review.png');
        }
        await page.getByTestId('accept-grade').click();
      }
      await expect(progress.or(cleared).first()).not.toHaveText(before, { timeout: 15_000 });
    }
    expect(shot, 'no blind-graded card came up').toBe(true);
  });

  await test.step('course map', async () => {
    await page.goto('/#/map');
    await expect(page.getByTestId('map-node').first()).toBeVisible({ timeout: 30_000 });
    // more room for the graph, and the inspector filled with the concept just studied
    await page.getByRole('button', { name: 'Hide the sidebar' }).click();
    await page.getByRole('tab', { name: 'Legend' }).click();
    await shoot(page, 'course-map.png');
    await page.getByRole('button', { name: /sidebar/i }).first().click();
  });

  await test.step('progress', async () => {
    await page.goto('/#/progress');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    await shoot(page, 'progress.png');
  });

  // Teach-back is reachable from the map, but in current Chrome (seen on 155) Element.scrollIntoView() returns a Promise and the
  // screen's `useEffect(() => bottom.current?.scrollIntoView(...))` hands that to React as a cleanup, which
  // crashes the screen. Shoot it when it renders; otherwise move on to the checkpoint.
  await test.step('teach-back (if the screen renders)', async () => {
    await page.goto('/#/map');
    await page.getByTestId('map-node').filter({ hasText: 'complement' }).first().click();
    await expect(page.getByTestId('concept-detail')).toBeVisible();
    const href = await page.getByTestId('concept-detail').getByRole('link', { name: 'Teach it back' }).getAttribute('href');
    await page.goto(`/${href}`);
    const screen = page.getByTestId('teachback-screen');
    const crashed = page.getByRole('heading', { name: 'This screen hit an error' });
    await expect(screen.or(crashed)).toBeVisible({ timeout: 30_000 });
    if (await crashed.isVisible()) {
      test.info().annotations.push({ type: 'skipped shot', description: 'teachback.png: the teach-back screen crashed' });
      return;
    }
    const input = page.getByTestId('teachback-input');
    await expect(input).toBeEnabled({ timeout: 30_000 });
    await input.fill('Every event has a complement: "A doesn\'t happen". Exactly one of the two always happens and they never overlap, so their probabilities add to 1, which gives P(not A) = 1 − P(A). It is the shortcut for any "at least one" question.');
    await screen.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(input).toBeEnabled({ timeout: 30_000 });
    await input.fill('Sure. Roll a die four times: what is the chance of at least one six? Counting every way to get one, two, three or four sixes is messy. The opposite is "no sixes at all", which is (5/6)^4 ≈ 0.48, so at least one six is 1 − 0.48 ≈ 0.52.');
    await shoot(page, 'teachback.png');
  });

  // The unit checkpoint, opened by its URL (Today only offers it once the whole unit is taught). Questions are
  // drawn at random, so answer through to one from the lesson just taken and shoot it with the answer typed.
  await test.step('checkpoint', async () => {
    await page.goto('/#/checkpoint/u-events-counting-rules');
    await expect(page.getByTestId('checkpoint-screen')).toBeVisible({ timeout: 30_000 });
    const answer = page.getByTestId('checkpoint-answer');
    const card = page.getByTestId('checkpoint-screen').locator('.reading').first();
    for (let i = 0; i < 20; i++) {
      await expect(answer).toBeEnabled({ timeout: 30_000 });
      await expect(answer).toHaveValue('');
      const prompt = await card.innerText();
      const known = REVIEW_ANSWERS.find(([re]) => re.test(prompt) && !/beginner/i.test(prompt));
      await answer.fill(known?.[1] ?? 'List the outcomes systematically, count the ones in the event, and divide by the total number of equally likely outcomes.');
      await page.getByTestId('checkpoint-screen').getByRole('button', { name: 'Fairly sure' }).click();
      if (known) {
        await shoot(page, 'checkpoint.png');
        return;
      }
      await page.getByTestId('checkpoint-submit').click();
    }
    throw new Error('no checkpoint question from the first lesson came up');
  });
});
