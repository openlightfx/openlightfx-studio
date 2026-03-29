import { type Page } from '@playwright/test';

export class ColorPickerPage {
  constructor(private page: Page) {}

  /** The Popover container for the keyframe popover (fixed position overlay). */
  private get popover() {
    return this.page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
  }

  /** Click the color swatch button to expand the color picker. */
  async toggleExpand(): Promise<void> {
    await this.popover.locator('button[aria-label="Toggle color picker"]').click();
    await this.page.waitForTimeout(200);
  }

  /** Check if the color wheel canvas is visible (picker is expanded). */
  async isWheelVisible(): Promise<boolean> {
    return this.popover.locator('canvas.cursor-crosshair').isVisible();
  }

  /** Click on the color wheel at a given angle (degrees) and radius fraction (0-1). */
  async clickWheel(angleDeg: number, radiusFraction: number): Promise<void> {
    const wheelCanvas = this.popover.locator('canvas.cursor-crosshair');
    const box = await wheelCanvas.boundingBox();
    if (!box) throw new Error('Color wheel not visible');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const maxRadius = box.width / 2;
    const r = maxRadius * radiusFraction;
    const rad = (angleDeg * Math.PI) / 180;
    const x = centerX + r * Math.cos(rad);
    const y = centerY - r * Math.sin(rad);
    await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(200);
  }

  /** Set an RGB slider value. channel is 'R', 'G', or 'B'. */
  async setRGBSlider(channel: 'R' | 'G' | 'B', value: number): Promise<void> {
    const sliderContainer = this.popover.locator(`label:has-text("${channel}")`).locator('..');
    const input = sliderContainer.locator('input[type="range"]');
    await input.evaluate((el: HTMLInputElement, val: number) => {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await this.page.waitForTimeout(100);
  }

  /** Type a hex value into the hex input and press Enter. */
  async setHex(hex: string): Promise<void> {
    const input = this.popover.locator('input#hex-input');
    await input.fill(hex);
    await input.press('Enter');
    await this.page.waitForTimeout(100);
  }

  /** Check if hex input shows an error. */
  async hasHexError(): Promise<boolean> {
    return this.popover.locator('span.text-danger').isVisible();
  }

  /** Switch to RGB or Kelvin mode. */
  async selectMode(mode: 'RGB' | 'Kelvin'): Promise<void> {
    const buttonText = mode === 'RGB' ? 'RGB' : 'Kelvin';
    await this.popover.locator(`button:has-text("${buttonText}")`).click();
    await this.page.waitForTimeout(200);
  }

  /** Check if the Kelvin slider is visible. */
  async isKelvinSliderVisible(): Promise<boolean> {
    return this.popover.locator('input[type="range"][min="1000"][max="10000"]').isVisible();
  }

  /** Set the Kelvin slider to a specific temperature. */
  async setKelvin(temperature: number): Promise<void> {
    const input = this.popover.locator('input[type="range"][min="1000"][max="10000"]');
    await input.evaluate((el: HTMLInputElement, val: number) => {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, temperature);
    await this.page.waitForTimeout(100);
  }

  /** Click a color history swatch by index. */
  async clickHistorySwatch(index: number): Promise<void> {
    const swatches = this.popover.locator('.grid-cols-8 button');
    await swatches.nth(index).click();
    await this.page.waitForTimeout(100);
  }

  /** Count the number of color history swatches (buttons, not empty placeholders). */
  async getHistoryCount(): Promise<number> {
    return this.popover.locator('.grid-cols-8 button').count();
  }

  /** Read a keyframe's color from the store. */
  async getKeyframeColor(keyframeId: string): Promise<{ r: number; g: number; b: number }> {
    return this.page.evaluate((id: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === id);
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : { r: -1, g: -1, b: -1 };
    }, keyframeId);
  }

  /** Read a keyframe's colorMode from the store. */
  async getKeyframeColorMode(keyframeId: string): Promise<string> {
    return this.page.evaluate((id: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === id);
      return kf?.colorMode ?? '';
    }, keyframeId);
  }
}
