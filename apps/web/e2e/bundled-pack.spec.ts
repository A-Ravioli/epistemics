import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PACK = fileURLToPath(new URL('../../../content/packs/probability-basics.epistemics.json', import.meta.url));

// The bundled probability pack is written by the content pipeline; skip cleanly when it is not in this build.
test.skip(!existsSync(PACK), 'bundled probability pack not present');

test('bundled probability pack: shelf → enrol → setup → today', async ({ page }) => {
  await page.goto('/#/shelf');
  await page.getByRole('tab', { name: 'Bundled', exact: true }).click();
  const card = page.getByTestId('pack-card').filter({ hasText: 'Probability' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('concepts');
  await card.getByTestId('enrol').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await page.getByTestId('diagnostic-opt').check();
  await page.getByTestId('create-course').click();
  // opted into the diagnostic: the first probe is shown; skipping it lands on Today with the lesson unlocked
  await expect(page.getByTestId('diagnostic-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip the diagnostic' }).click();
  await expect(page.getByTestId('diagnostic-done')).toBeVisible();
  await page.getByRole('button', { name: 'Go to Today' }).click();
  await expect(page.getByTestId('lesson-unlocked')).toBeVisible();
  await expect(page.getByTestId('review-summary')).toContainText('Nothing due');
  // the map renders one node per concept
  await page.goto('/#/map');
  expect(await page.getByTestId('map-node').count()).toBeGreaterThan(3);
});
