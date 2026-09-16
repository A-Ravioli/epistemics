import { test, expect } from '@playwright/test';

test('app boots and shows navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Epistemics')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
});
