import { test, expect } from '@playwright/test';

test('app boots and shows navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Epistemics').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  // no course yet: Today redirects to the Shelf with a prompt to enrol
  await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
  await expect(page.getByTestId('mock-banner')).toBeVisible();
});
