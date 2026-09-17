import { test, expect } from '@playwright/test';

// The provider screen is the first thing a new device sees, and what it saves is what Settings shows.
test('welcome: turning Claude on and entering a key saves the tutor', async ({ page }) => {
  await page.goto('/#/welcome');
  await expect(page.getByTestId('welcome-screen')).toBeVisible();
  // both providers start off, so the button says what continuing without one means
  await expect(page.getByTestId('welcome-continue')).toContainText('demo tutor');

  await page.getByTestId('provider-claude-switch').click();
  await expect(page.getByTestId('welcome-continue')).toHaveText('Continue');
  await page.getByTestId('welcome-api-key').fill('sk-ant-test-key');
  await page.getByTestId('welcome-continue').click();

  await expect(page.getByTestId('first-run')).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByTestId('llm-mode').getByRole('radio', { name: 'Anthropic (Claude)' })).toBeChecked();
  await expect(page.getByTestId('settings-tutor')).toContainText('one is stored');
});
