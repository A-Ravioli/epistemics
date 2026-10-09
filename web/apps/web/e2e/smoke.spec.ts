import { test, expect } from '@playwright/test';

test('first launch asks what to learn, then the window shows its three panes', async ({ page }) => {
  await page.goto('/');
  // the first-run flow owns the whole window: no sidebar, no inspector, one question at a time
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  await expect(page.getByTestId('step-subject')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

  // walk out of it without choosing a course: Today falls back to its no-course state
  await page.goto('/#/today');

  // the shell: toolbar, sidebar, content
  await expect(page.getByTestId('toolbar')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('mock-banner')).toBeVisible();
  await expect(page.getByTestId('first-run')).toBeVisible();

  // and its one button leads back into the flow
  await page.getByTestId('first-run-start').click();
  await expect(page.getByTestId('step-subject')).toBeVisible();
});

test('the toolbar search opens the command palette and goes where it is told', async ({ page }) => {
  await page.goto('/#/today');
  await page.getByTestId('toolbar-search').click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('shelf');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
});
