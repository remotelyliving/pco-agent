import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page has Planning Center sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in with planning center/i })).toBeVisible();
  });

  test('login page shows error when auth fails', async ({ page }) => {
    await page.goto('/login?error=OAuthCallback');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
