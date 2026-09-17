import { test, expect } from '@playwright/test';

test('app boots and shows navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Epistemics').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  // no course yet: Today shows the first-run state with one primary action leading to the Shelf
  await expect(page.getByTestId('first-run')).toBeVisible();
  await expect(page.getByTestId('mock-banner')).toBeVisible();
});
