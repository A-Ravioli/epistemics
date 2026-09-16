import { test, expect, type Page } from '@playwright/test';
import { completeFirstLesson, importAndEnrol } from './helpers.js';

// One browser context for the whole loop: the database lives in this origin's OPFS (or the in-memory
// fallback), so the review test builds on the lesson test's state.
test.describe.serial('learner loop with the mock tutor', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('shelf → enrol → today shows the lesson unlocked', async () => {
    await importAndEnrol(page);
    await expect(page.getByTestId('mock-banner')).toContainText('Demo tutor');
    await expect(page.getByTestId('review-summary')).toContainText('Nothing due');
    await expect(page.getByTestId('lesson-unlocked')).toBeVisible();
    await expect(page.getByTestId('lesson-card')).toContainText('The complement rule');
  });

  test('lesson: PRIME → DEVELOP → give up → CHECK → complete → reviews due', async () => {
    await completeFirstLesson(page);
    await page.getByTestId('back-to-today').click();
    await expect(page.getByTestId('review-summary')).toContainText('due', { timeout: 15_000 });
    await expect(page.getByTestId('start-reviews')).toBeVisible();
    // the gate is now closed
    await expect(page.getByTestId('lock-reason')).toBeVisible();
  });

  test('review: rate a card and the queue shrinks', async () => {
    await page.getByTestId('start-reviews').click();
    await expect(page.getByTestId('review-screen')).toBeVisible();
    const progress = page.getByTestId('review-progress');
    await expect(progress).toContainText('1 of');
    const before = Number((await progress.innerText()).match(/of (\d+)/)?.[1]);
    expect(before).toBeGreaterThanOrEqual(1);

    // confidence is collected before the reveal/grade, whatever the item type
    const isSelfGraded = await page.getByTestId('review-continue').isEnabled();
    if (!isSelfGraded) await page.getByTestId('review-answer').fill('The event and its complement are disjoint and exhaust the sample space, so the probabilities sum to one.');
    await page.getByTestId('review-continue').click();
    await expect(page.getByTestId('review-reveal')).toHaveCount(0);
    await page.getByRole('button', { name: 'Certain' }).click();
    if (await page.getByTestId('show-answer').count()) {
      await page.getByTestId('show-answer').click();
      await expect(page.getByTestId('review-reveal')).toBeVisible();
      await page.getByRole('button', { name: /Good/ }).click();
    } else {
      await page.getByTestId('grade-answer').click();
      await expect(page.getByTestId('grade-receipt')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('accept-grade').click();
    }
    // either the next card is shown with progress advanced, or the queue is finished
    await expect
      .poll(async () => {
        if (await page.getByText('Reviews cleared').count()) return 'cleared';
        const t = await progress.innerText().catch(() => '');
        return /1 done/.test(t) ? 'advanced' : 'pending';
      }, { timeout: 15_000 })
      .not.toBe('pending');
    await page.goto('/#/today');
    await expect(page.getByTestId('review-card')).toBeVisible();
  });
});
