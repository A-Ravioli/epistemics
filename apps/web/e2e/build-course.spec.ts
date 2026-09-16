import { test, expect } from '@playwright/test';

// Subject-only build driven end to end by the mock architect (no key): setup → "From a subject" → scope
// interview → outline review (rename a unit) → build → Today offers the renamed unit's first lesson.
test('build a course from a subject: interview → outline review → build → today', async ({ page }) => {
  await page.goto('/#/setup');
  await expect(page.getByTestId('setup-screen')).toHaveAttribute('data-step', 'source');
  await page.getByRole('tab', { name: 'From a subject' }).click();
  await page.getByTestId('subject').fill('Real analysis');
  await page.getByTestId('level').selectOption('intro undergraduate');
  await page.getByTestId('goals').fill('Understand limits and continuity rigorously.');
  await page.getByTestId('continue-to-interview').click();

  await expect(page.getByTestId('setup-screen')).toHaveAttribute('data-step', 'interview');
  await page.getByTestId('background').fill('Calculus at school.');
  await page.getByTestId('propose-outline').click();

  // outline review: the mock proposes three units; rename the first
  await expect(page.getByTestId('outline-review')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('outline-unit')).toHaveCount(3);
  await expect(page.getByTestId('unit-title-0')).toHaveValue(/Real analysis/);
  await page.getByTestId('unit-title-0').fill('Sequences and limits');
  await page.getByTestId('build-course').click();

  // build progress, then enrolment and Today
  await expect(page.getByTestId('setup-screen')).toHaveAttribute('data-step', 'build');
  await expect(page.getByTestId('lesson-card')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('lesson-card')).toContainText('Sequences and limits');
  await expect(page.getByTestId('lesson-card')).toContainText('Definitions and notation (1.1)');
  await expect(page.getByTestId('lesson-unlocked')).toBeVisible();
  await expect(page.getByTestId('review-summary')).toContainText('Nothing due');
  await expect(page.getByTestId('mock-banner')).toBeVisible();

  // the third unit is generated in the background (two ahead of the learner) and the pill goes away
  await expect(page.getByTestId('unit-build-pill')).toHaveCount(0, { timeout: 30_000 });

  // the Shelf lists it under "Built by you", now fully built and exportable
  await page.goto('/#/shelf');
  await page.getByRole('tab', { name: /Built by you/ }).click();
  const card = page.getByTestId('built-card').filter({ hasText: 'Sequences and limits' }).or(page.getByTestId('built-card').filter({ hasText: 'Real analysis' }));
  await expect(card.first()).toBeVisible();
  await expect(card.first()).toContainText('fully built', { timeout: 30_000 });
  await expect(card.first().getByTestId('export-built')).toBeEnabled();
  await expect(card.first()).toContainText('architect');
});

// Material path: a Markdown file is parsed, chunked and indexed locally; the outline is grounded in it.
test('build a course from uploaded material: pick a markdown file → outline → build → today', async ({ page }) => {
  const md = [
    '# Field Notes on Thermodynamics', '',
    'Heat flows from hot to cold until temperatures equalise. '.repeat(20), '',
    '## Entropy', '', 'Entropy measures the number of microstates consistent with a macrostate. '.repeat(20), '',
    '# Engines', '', 'A heat engine converts a temperature difference into work with efficiency bounded by Carnot. '.repeat(20),
  ].join('\n');
  await page.goto('/#/setup');
  await page.getByRole('tab', { name: 'From my material' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('pick-files').click();
  await (await chooser).setFiles({ name: 'thermo-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  const list = page.getByTestId('source-list');
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).toContainText('Field Notes on Thermodynamics');
  await expect(list).toContainText(/\d+ chunks?/);
  await expect(page.getByTestId('subject')).toHaveValue('Field Notes on Thermodynamics');
  await page.getByTestId('continue-to-interview').click();
  await page.getByTestId('propose-outline').click();
  await expect(page.getByTestId('outline-review')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('outline-review')).toContainText('grounded');
  await page.getByTestId('build-course').click();
  await expect(page.getByTestId('lesson-card')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('lesson-unlocked')).toBeVisible();
  await expect(page.getByTestId('lesson-card')).toContainText('Field Notes on Thermodynamics');
});
