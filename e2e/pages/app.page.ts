import { type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/test-project.json');
const VIDEO_PATH = path.resolve(__dirname, '../fixtures/test-video.mp4');

export { VIDEO_PATH };

export class AppPage {
  constructor(public readonly page: Page) {}

  /** Seed localStorage with test project, navigate, wait for canvas render. */
  async boot(): Promise<void> {
    const fixture = fs.readFileSync(FIXTURE_PATH, 'utf8');
    await this.page.addInitScript((json: string) => {
      localStorage.setItem('openlightfx-studio:snapshot:test-fixture', json);
    }, fixture);
    await this.page.goto('/');
    await this.page.waitForSelector('canvas', { timeout: 15_000 });
    // Wait a tick for Svelte effects to settle
    await this.page.waitForTimeout(500);
    // Set a predictable zoom level for tests (0.2 px/ms = 5000ms spans 1000px)
    await this.page.evaluate(() => {
      (window as any).__stores.timelineStore.pxPerMs = 0.2;
      (window as any).__stores.timelineStore.scrollX = 0;
    });
    await this.page.waitForTimeout(100);
  }

  /** Navigate without seeding — shows NewProjectDialog. */
  async bootFresh(): Promise<void> {
    await this.page.addInitScript(() => {
      localStorage.clear();
    });
    await this.page.goto('/');
  }

  /** Load video via hidden file input + synthetic drop event. */
  async loadVideo(): Promise<void> {
    await this.page.evaluate(async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.id = '__test-file-input';
      input.style.display = 'none';
      document.body.appendChild(input);
    });

    await this.page.locator('#__test-file-input').setInputFiles(VIDEO_PATH);

    await this.page.evaluate(() => {
      const input = document.getElementById('__test-file-input') as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) throw new Error('No file set');

      const panel = document.querySelector('[aria-label="Video panel"]');
      if (!panel) throw new Error('Video panel not found');

      const dt = new DataTransfer();
      dt.items.add(file);
      panel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      panel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

      input.remove();
    });

    await this.page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.readyState >= 1 && v.duration > 0;
      },
      { timeout: 30_000 },
    );
  }

  get canvas(): Locator {
    return this.page.locator('.timeline-panel canvas').first();
  }

  get channelHeaders(): Locator {
    return this.page.locator('.channel-headers');
  }
}
