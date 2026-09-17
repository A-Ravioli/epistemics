import { test, expect } from '@playwright/test';

test('first launch asks for a tutor, then the window shows its three panes', async ({ page }) => {
  await page.goto('/');
  // the provider screen owns the whole window: no sidebar, no inspector, one decision
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  await expect(page.getByTestId('provider-claude')).toBeVisible();
  await page.getByTestId('welcome-skip').click();

  // the shell: toolbar, sidebar, content
  await expect(page.getByTestId('toolbar')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('mock-banner')).toBeVisible();
  // no course yet: Today shows the first-run state with one primary action leading to the Shelf
  await expect(page.getByTestId('first-run')).toBeVisible();

  // and it is not asked for again on this device
  await page.goto('/');
  await expect(page.getByTestId('first-run')).toBeVisible();
});

test('the toolbar search opens the command palette and goes where it is told', async ({ page }) => {
  await page.goto('/#/today');
  await page.getByTestId('toolbar-search').click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('shelf');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
});
