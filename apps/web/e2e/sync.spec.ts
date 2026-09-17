import { test, expect, type Page } from '@playwright/test';
import { completeFirstLesson, importAndEnrol } from './helpers.js';

async function outboxCount(page: Page): Promise<number> {
  await page.goto('/#/account');
  await expect(page.getByTestId('account-screen')).toBeVisible();
  const count = page.getByTestId('outbox-count');
  await expect(count).toHaveAttribute('data-fresh', 'true');
  return Number(await count.innerText());
}

test.describe.serial('account and sync (offline-first)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('account screen renders signed out with sync off', async () => {
    await page.goto('/#/account');
    await expect(page.getByRole('heading', { name: 'Account and sync' })).toBeVisible();
    await expect(page.getByTestId('sync-state')).toHaveText('signed out');
    await expect(page.getByTestId('sync-now')).toBeDisabled();
    await expect(page.getByTestId('sign-in')).toBeDisabled();
    await expect(page.getByTestId('outbox-count')).toHaveText(/^\d+$/);
    // reachable from Settings too
    await page.goto('/#/settings');
    await page.getByTestId('account-link').click();
    await expect(page.getByTestId('account-screen')).toBeVisible();
  });

  test('a malformed URL is rejected with a clear message', async () => {
    await page.goto('/#/account');
    await page.getByTestId('supabase-url').fill('not a url');
    await page.getByTestId('supabase-anon-key').fill('anon');
    await page.getByTestId('save-supabase').click();
    await expect(page.getByTestId('account-error')).toContainText('not a valid URL');
    await expect(page.getByTestId('sync-configured')).toContainText('Not configured');
  });

  test('an unreachable project shows an error and the app keeps working', async () => {
    await page.goto('/#/account');
    await page.getByTestId('supabase-url').fill('http://127.0.0.1:9');
    await page.getByTestId('supabase-anon-key').fill('anon');
    await page.getByTestId('save-supabase').click();
    await expect(page.getByTestId('sync-configured')).toContainText('Configured');
    await page.getByTestId('email').fill('learner@example.com');
    await page.getByTestId('password').fill('correct horse battery staple');
    await page.getByTestId('sign-in').click();
    await expect(page.getByTestId('account-error')).toContainText('Could not reach Supabase', { timeout: 30_000 });
    await expect(page.getByTestId('sync-state')).toHaveText('signed out');
    // still offline-first: the rest of the app works and the outbox keeps recording local writes
    await importAndEnrol(page);
    await expect(page.getByTestId('lesson-card')).toBeVisible();
  });

  test('outbox count grows after a lesson with reviews', async () => {
    const before = await outboxCount(page);
    expect(before).toBeGreaterThan(0); // curriculum, course and cards from enrolment
    await page.goto('/#/today');
    await completeFirstLesson(page);
    const after = await outboxCount(page);
    expect(after).toBeGreaterThan(before);
  });
});
