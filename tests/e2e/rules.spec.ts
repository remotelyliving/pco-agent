import { test, expect } from '@playwright/test';

test.describe('Rules Page', () => {
  test('rules page redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/rules');
    await expect(page).toHaveURL(/\/login/);
  });
});
