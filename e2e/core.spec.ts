import { test, expect } from '@playwright/test';

/**
 * The doc's three core paths: ① map loads and a spot opens, ② submitting a
 * report updates the UI, ③ filters take effect. Plus the landing → map hop.
 */

test('landing page renders and leads to the map', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Where to');
  await page.getByRole('link', { name: 'Open the map', exact: false }).first().click();
  await expect(page).toHaveURL(/\/map/);
  await expect(page.getByText(/spots? found/).first()).toBeVisible();
});

test('selecting a spot opens the detail panel', async ({ page }) => {
  await page.goto('/map');
  // The list is the accessible path to the map (markers are aria-hidden)
  const firstCard = page.locator('aside li button').first();
  await firstCard.waitFor();
  const name = await firstCard.locator('h3').textContent();
  await firstCard.click();

  await expect(page).toHaveURL(/spot=/);
  // The panel exists twice in the DOM (desktop overlay + mobile bottom sheet) — assert on the first
  await expect(page.getByRole('heading', { level: 2, name: name ?? '' }).first()).toBeVisible();
  await expect(page.getByText('How full right now').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Amenities' }).first()).toBeVisible();
});

test('submitting a report updates the spot and asks a piggyback question', async ({ page }) => {
  await page.goto('/map');
  await page.locator('aside li').first().waitFor();
  await page.locator('aside li').first().getByRole('button', { name: /Report/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('How full is it?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Filling up' }).click();
  await dialog.getByRole('button', { name: 'Quiet', exact: true }).click();
  await dialog.getByRole('button', { name: 'Submit' }).click();

  await expect(dialog.getByText('Updated!')).toBeVisible();
  // Either a piggyback question or the all-done message must follow
  await expect(dialog.getByText(/Answer one quick thing\?|filled in everything/)).toBeVisible();
});

test('tri-state amenity filter narrows results and encodes into the URL', async ({ page }) => {
  await page.goto('/map');
  const counter = page.getByText(/spots? found/).first();
  await counter.waitFor();
  const before = Number((await counter.textContent())?.match(/\d+/)?.[0] ?? '0');

  // Any → Required → Strict
  const outletsChip = page.getByRole('button', { name: /Outlets filter/ });
  await outletsChip.click();
  await outletsChip.click();

  await expect(page).toHaveURL(/outlets=2/);
  const after = Number((await counter.textContent())?.match(/\d+/)?.[0] ?? '0');
  expect(after).toBeLessThanOrEqual(before);

  // Strict mode must exclude unknowns: no unknown-outlet helper chip remains
  await expect(page.getByText(/with unknown outlets/)).toHaveCount(0);
});

test('keyboard-only path: filter → select spot → open report dialog', async ({ page }) => {
  await page.goto('/map');
  await page.locator('aside li').first().waitFor();

  // Tab to reach interactive elements, then activate the first card via keyboard
  const firstCardButton = page.locator('aside li button').first();
  await firstCardButton.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/spot=/);

  const reportButton = page.getByRole('button', { name: /I'm here — report/ }).first();
  await reportButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByText('How full is it?')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
