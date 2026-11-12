import { expect, type Locator, type Page, type Response } from '@playwright/test';

/** Page object for the spec's shell, transport, library, and timeline. */
export class StudioPage {
  constructor(readonly page: Page) {}

  async openLocal(): Promise<void> {
    await this.page.goto('/');
  }

  async openHosted(query = 'api_key=test-admin'): Promise<Response | null> {
    return this.page.goto(`/emby/OpenLightFX/studio/?${query}`);
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  async backgroundLuminance(): Promise<number> {
    const [r, g, b] = await this.page.evaluate(() => {
      const color = getComputedStyle(document.body).backgroundColor;
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return [255, 255, 255];
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    });
    const linear = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  durationInputs(): Locator {
    return this.page.locator('input').filter({ hasText: /duration/i }).or(this.page.getByLabel(/duration/i));
  }

  async expectNoDurationField(): Promise<void> {
    await expect(this.page.getByLabel(/track duration|movie duration|length in minutes/i)).toHaveCount(0);
  }

  canvas(): Locator {
    return this.page.locator('canvas').first();
  }
}
