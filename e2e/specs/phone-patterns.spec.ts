import { test, expect } from '@playwright/test';
import { Demo } from './helpers';
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
async function hold(page: any, sel: string) {
  const el = page.locator(sel).first(); await el.waitFor(); const b = await el.boundingBox(); const x = b.x + 40, y = b.y + 30;
  await el.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: x, clientY: y, isPrimary: true });
  await page.waitForTimeout(800); await el.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, clientX: x, clientY: y }); await page.waitForTimeout(300);
}
test('phone: long press a suggested job shows approve and decline actions; Back leaves selection', async ({ page }) => {
  const d = await Demo.start('imran'); try {
    await d.page(page); await page.goto('/suggestions'); await hold(page, '.suggestion-row[data-status=pending]');
    const bar = page.locator('.selection-bar'); await expect(bar).toContainText('1 selected');
    await expect(bar).toContainText(/Approve|Decline/);
    await page.keyboard.press('Escape'); await expect(bar).toHaveCount(0);
  } finally { await d.reset(); }
});
test('phone: long press a finished job offers Archive; archived job moves to Archived jobs and can come back', async ({ page }) => {
  const d = await Demo.start('imran'); try {
    await d.page(page); await page.goto('/work-orders?status=done'); await hold(page, '.work-card-wrap');
    const bar = page.locator('.selection-bar'); await expect(bar).toContainText('Archive');
    const title = (await page.locator('.work-card-wrap').first().locator('strong').first().innerText()).trim();
    await bar.getByRole('button', { name: 'Archive' }).click(); await expect(page.getByText(/archived\./)).toBeVisible();
    await page.goto('/work-orders?archived=true'); await expect(page.locator('.work-card-wrap', { hasText: title }).first()).toBeVisible();
    await hold(page, '.work-card-wrap'); await page.locator('.selection-bar').getByRole('button', { name: 'Bring back' }).click();
    await expect(page.getByText(/back in the list/)).toBeVisible();
  } finally { await d.reset(); }
});
