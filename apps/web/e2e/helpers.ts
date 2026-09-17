import { expect, type Page } from '@playwright/test';
import { TINY, tinyPack } from '../test-fixtures/tiny-pack.js';

export { TINY };

/** Import the tiny fixture pack through the Shelf's file picker and enrol with default settings. */
export async function importAndEnrol(page: Page): Promise<void> {
  await page.goto('/#/shelf');
  await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-pack').click();
  const fc = await chooser;
  await fc.setFiles({ name: 'tiny.epistemics.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tinyPack())) });
  await expect(page.getByTestId('shelf-message')).toContainText('Imported');
  await page.getByTestId('library-card').filter({ hasText: 'Tiny Probability' }).getByTestId('enrol').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await page.getByTestId('background').fill('I have seen basic probability before.');
  await page.getByTestId('create-course').click();
  await expect(page.getByTestId('lesson-card')).toBeVisible();
}

async function waitPhase(page: Page, phase: string): Promise<void> {
  await expect(page.getByTestId('phase-indicator')).toHaveAttribute('data-phase', phase, { timeout: 30_000 });
  await expect(page.getByTestId('lesson-input')).toBeEnabled({ timeout: 30_000 });
}

async function answer(page: Page, text: string, confidence?: 'Guess' | 'Fairly sure' | 'Certain'): Promise<void> {
  await expect(page.getByTestId('lesson-input')).toBeEnabled({ timeout: 30_000 });
  if (confidence) await page.getByRole('button', { name: confidence }).click();
  await page.getByTestId('lesson-input').fill(text);
  await page.getByTestId('send').click();
}

const panel = (page: Page) => page.getByTestId('side-panel');

/** Drive the first lesson of the tiny pack from PRIME to completion with the mock tutor. */
export async function completeFirstLesson(page: Page): Promise<void> {
  const A = TINY.answers;
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('lesson-screen')).toBeVisible();
  await waitPhase(page, 'PRIME');
  // input disabled while the tutor streams was already observed via toBeEnabled; confidence is required in PRIME
  await expect(page.getByTestId('send')).toBeDisabled();
  // PRIME is a cold attempt: the side panel must not be holding the answer (DESIGN §7.3).
  await expect(panel(page)).not.toContainText(TINY.concept1Definition);
  await expect(page.getByTestId('concept-concealed')).toBeVisible();
  await answer(page, A.pretest, 'Fairly sure');
  await waitPhase(page, 'PROBE');
  await expect(page.getByTestId('chat-log')).toContainText("Let's find out.");
  await expect(panel(page)).not.toContainText(TINY.concept1Definition);
  await answer(page, A.probe);
  await waitPhase(page, 'DEVELOP');
  // The tutor is teaching from here, so the concept context comes back.
  await expect(panel(page)).toContainText(TINY.concept1Definition);
  await page.getByTestId('give-up').click();
  await waitPhase(page, 'CONSOLIDATE');
  await answer(page, A.consolidate);
  await waitPhase(page, 'EXTEND');
  await answer(page, A.transfer);
  await waitPhase(page, 'CHECK');
  // The unaided check is the one that counts toward mastery: nothing on screen may help with it.
  await expect(panel(page)).not.toContainText(TINY.concept1Definition);
  await expect(page.getByTestId('concept-concealed')).toBeVisible();
  await answer(page, A.check, 'Certain');
  await expect(page.getByTestId('wrap-summary')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('summary-input').fill(A.summary);
  await page.getByTestId('submit-summary').click();
  await expect(page.getByTestId('wrap-jol')).toBeVisible();
  await expect(page.getByTestId('submit-jol')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('submit-jol').click();
  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await expect(page.getByTestId('lesson-done')).toContainText('passed');
}
