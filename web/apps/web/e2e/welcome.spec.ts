import { test, expect, type Page } from '@playwright/test';

/**
 * The first run (docs/ONBOARDING.md): subject → what you already know → tutor → time. The order is the
 * point — nothing is asked about models or keys until the learner has picked a subject and retrieved
 * something from it.
 */

const bundled = (page: Page) => page.getByTestId('onboarding-pack').first();

async function pickBundledCourse(page: Page): Promise<void> {
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  await expect(page.getByTestId('welcome-screen')).toHaveAttribute('data-step', 'subject');
  // Nothing about a tutor or a key on the first screen: the learner is asked what they came to do.
  await expect(page.getByTestId('welcome-api-key')).toHaveCount(0);
  await expect(bundled(page)).toBeVisible({ timeout: 30_000 });
  await bundled(page).click();
  await page.getByTestId('onboarding-next').click();
}

test('first run: subject, then a retrieval, then the tutor, then the rule', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);

  // Step 2 is the pivot: the learner retrieves before the app explains anything.
  await expect(page.getByTestId('step-recall')).toBeVisible();
  await page.getByTestId('recall-input').fill('I remember the complement rule: one minus the probability of the event. Also that probabilities add to one.');
  await page.getByTestId('onboarding-next').click();

  // And only then is the loop explained, with what the app heard fed back.
  await expect(page.getByTestId('step-reflection')).toBeVisible();
  await expect(page.getByTestId('reflection')).toContainText(/the complement rule/i);

  await page.getByTestId('onboarding-next').click();

  // Step 3: the tutor, at the point where the stakes are legible.
  await expect(page.getByTestId('step-tutor')).toBeVisible();
  await page.getByTestId('welcome-tutor').getByText('The demo tutor', { exact: true }).click();
  await page.getByTestId('onboarding-next').click();

  // Step 4: one scheduling question, and the gate stated before it binds.
  await expect(page.getByTestId('step-commitment')).toBeVisible();
  await expect(page.getByTestId('gate-contract')).toContainText('Reviews come first');
  await page.getByRole('button', { name: /10 min/ }).click();
  await expect(page.getByTestId('gate-contract')).toContainText('30 cards');
  await page.getByTestId('onboarding-finish').click();

  // Out onto a Today that already has something to do: never an empty state.
  await expect(page.getByTestId('next-up')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('start-lesson')).toBeVisible();
});

test('the recall becomes the background and the minutes become the review cap', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);
  await page.getByTestId('recall-input').fill('Nothing much, I did some stats years ago.');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('welcome-tutor').getByText('The demo tutor', { exact: true }).click();
  await page.getByTestId('onboarding-next').click();
  await page.getByRole('button', { name: /40 min/ }).click();
  await page.getByTestId('onboarding-finish').click();
  await expect(page.getByTestId('next-up')).toBeVisible({ timeout: 30_000 });

  // 40 minutes a day → a cap of 120 cards, and the scaffolding set from what they wrote.
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-scheduling').getByLabel(/Reviews per day/)).toHaveValue('120');
  await expect(page.getByTestId('settings-scheduling')).toContainText('developing');
});

test('a key entered at the tutor step is what Settings then shows', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);
  await page.getByTestId('recall-input').fill('');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();

  await expect(page.getByTestId('step-tutor')).toBeVisible();
  await page.getByTestId('welcome-tutor').getByText('Claude', { exact: true }).click();
  await page.getByTestId('welcome-api-key').fill('sk-ant-test-key');
  await page.getByTestId('onboarding-next').click();

  await expect(page.getByTestId('step-commitment')).toBeVisible();
  await page.getByTestId('onboarding-finish').click();
  await expect(page.getByTestId('next-up')).toBeVisible({ timeout: 30_000 });

  await page.goto('/#/settings');
  await expect(page.getByTestId('llm-mode').getByRole('radio', { name: 'Anthropic (Claude)' })).toBeChecked();
  await expect(page.getByTestId('settings-tutor')).toContainText('one is stored');
});

test('the placement offer appears only when the recall earns it', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);
  await page.getByTestId('recall-input').fill('no idea');
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('step-reflection')).toBeVisible();
  await expect(page.getByTestId('placement-offer')).toHaveCount(0);

  // Naming two of the pack's concepts is what earns it.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('recall-input').fill('the complement rule, and the addition rule for disjoint events');
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('placement-offer')).toBeVisible();
});

test('the flow resumes where a reload interrupted it', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);
  await page.getByTestId('recall-input').fill('Bayes, conditional probability, and something about independence.');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('step-tutor')).toBeVisible();

  await page.reload();
  // The draft is in the database, so the answers survive; the steps start again from the top of the flow.
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('recall-input')).toHaveValue(/Bayes/);
});

test('a deferred tutor is carried on Today rather than lost', async ({ page }) => {
  await page.goto('/');
  await pickBundledCourse(page);
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-skip').click(); // "Decide later"
  await expect(page.getByTestId('step-commitment')).toBeVisible();
  await page.getByTestId('onboarding-finish').click();

  await expect(page.getByTestId('next-up')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tutor-line')).toContainText('cannot really teach');
});

// The generated path: the flow hands over to Setup with the interview already answered, and the outline is
// requested while the learner is still on the commitment step (docs/ONBOARDING.md §3).
test('a named subject goes straight from the flow to the outline, with no second interview', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('step-subject')).toBeVisible();
  await page.getByTestId('onboarding-source').getByText('A subject I name', { exact: true }).click();
  await page.getByTestId('onboarding-subject').fill('Real analysis');
  await page.getByTestId('onboarding-next').click();

  await page.getByTestId('recall-input').fill('Calculus at school: limits, derivatives, some epsilon-delta.');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();

  await page.getByTestId('welcome-tutor').getByText('The demo tutor', { exact: true }).click();
  await page.getByTestId('onboarding-next').click();

  // The curriculum is being sketched behind this step rather than after it.
  await expect(page.getByTestId('step-commitment')).toBeVisible();
  await expect(page.getByTestId('outlining-ahead')).toBeVisible();
  await page.getByTestId('onboarding-finish').click();

  // Setup picks up every answer, so the only thing left is the one editorial decision.
  await expect(page.getByTestId('setup-screen')).toHaveAttribute('data-step', 'outline');
  await expect(page.getByTestId('outline-review')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('build-course').click();
  await expect(page.getByTestId('lesson-card')).toBeVisible({ timeout: 60_000 });

  // and the answers given in the flow reached the course
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-scheduling')).toContainText('developing');
});
