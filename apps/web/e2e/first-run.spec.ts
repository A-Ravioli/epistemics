import { test, expect, type Page } from '@playwright/test';
import { importAndEnrol } from './helpers.js';

async function horizontalOverflow(page: Page): Promise<{ doc: number; win: number; main: number; mainClient: number; wide: string[] }> {
  return page.evaluate(() => {
    const win = window.innerWidth;
    const main = document.querySelector('main')!;
    const wide: string[] = [];
    document.querySelectorAll<HTMLElement>('main *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > win + 1) wide.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className.toString().slice(0, 40)}] right=${Math.round(r.right)}`);
    });
    return { doc: document.documentElement.scrollWidth, win, main: main.scrollWidth, mainClient: main.clientWidth, wide: wide.slice(0, 10) };
  });
}

// First launch: Today explains the app in two sentences and its one primary button leads to the Shelf,
// where the no-course banner explains enrol / build / import. Protected screens fall back to the same state.
test('first run: empty Today explains the app and leads to the Shelf', async ({ page }) => {
  await page.goto('/#/today');
  const first = page.getByTestId('first-run');
  await expect(first).toBeVisible();
  await expect(first).toContainText('tutor');
  await expect(first).toContainText('reviews');
  await expect(first.getByRole('button')).toHaveCount(1);
  await page.getByTestId('first-run-shelf').click();
  await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
  await expect(page.getByTestId('shelf-no-course')).toBeVisible();
  await expect(page.getByTestId('pack-card').first()).toBeVisible({ timeout: 30_000 });
  // a protected screen without a course lands on the same first-run state
  await page.goto('/#/progress');
  await expect(page.getByTestId('first-run')).toBeVisible();
});

test.describe('narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Today has no horizontal overflow at 390px and the top bar menu navigates', async ({ page }) => {
    // first-run Today
    await page.goto('/#/today');
    await expect(page.getByTestId('first-run')).toBeVisible();
    let o = await horizontalOverflow(page);
    expect(o.wide, o.wide.join('\n')).toEqual([]);
    expect(o.doc).toBeLessThanOrEqual(o.win);

    // the sidebar collapses into a top bar with a menu at this width
    await expect(page.getByTestId('menu-toggle')).toBeVisible();
    await page.getByTestId('menu-toggle').click();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await page.getByTestId('mobile-nav').getByRole('link', { name: 'Shelf' }).click();
    await expect(page.getByRole('heading', { name: 'Shelf' })).toBeVisible();
    await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
    o = await horizontalOverflow(page);
    expect(o.wide, o.wide.join('\n')).toEqual([]);

    // Today with a course: hero, review card, lesson card and stats all fit
    await importAndEnrol(page);
    await expect(page.getByTestId('next-up')).toBeVisible();
    o = await horizontalOverflow(page);
    expect(o.wide, o.wide.join('\n')).toEqual([]);
    expect(o.doc).toBeLessThanOrEqual(o.win);
    expect(o.main).toBeLessThanOrEqual(o.mainClient);
  });
});
