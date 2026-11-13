import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';

requirement('SHELL-010 @browser an empty studio explains how to start', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('option', { name: /proxy fixture/i })).toContainText('Proxy Fixture');
  const guide = page.locator('[data-empty-state]');
  await expect(guide).toContainText(/pick a movie/i);
  await expect(guide).toContainText(/channel/i);
  await expect(guide).toContainText(/keyframe/i);
  await expect(guide).toContainText(/map bulbs/i);
  await expect(guide).toContainText(/save/i);
  await expect(page.locator('[data-ruler]')).toContainText('0:00');
  await expect(page.getByText(/^movie$/)).toHaveCount(0);
  await expect(page).toHaveScreenshot('empty-studio.png', {
    maxDiffPixelRatio: 0.03,
    animations: 'disabled',
    mask: [page.locator('video')],
  });
});

requirement(
  'SHELL-010 @browser an open movie keeps a titled library and a time ruler',
  async ({ page }) => {
    await page.goto('/');
    await page.getByRole('option', { name: /proxy fixture/i }).click();
    const row = page.getByRole('option', { name: /proxy fixture/i });
    await expect(row).toContainText('Proxy Fixture');
    await expect(row.locator('img')).toBeVisible();
    await expect(page.locator('[data-ruler]')).toContainText('0:00');
    await expect(page.locator('[data-empty-state]')).toHaveCount(0);
    await expect(page).toHaveScreenshot('open-movie.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
      mask: [page.locator('video')],
    });
  }
);
