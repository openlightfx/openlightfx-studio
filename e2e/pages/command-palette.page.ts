import { type Page } from '@playwright/test';

export class CommandPalettePage {
  constructor(private page: Page) {}

  private get dialog() {
    return this.page.locator('[role="dialog"][aria-label="Command palette"]');
  }

  private get input() {
    return this.dialog.locator('input[aria-label="Search commands"]');
  }

  async open(): Promise<void> {
    await this.page.keyboard.press('Control+k');
    await this.dialog.waitFor({ state: 'visible', timeout: 3_000 });
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.dialog.waitFor({ state: 'hidden', timeout: 3_000 });
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible();
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query);
    await this.page.waitForTimeout(100);
  }

  async executeByLabel(label: string): Promise<void> {
    await this.search(label);
    await this.dialog.locator(`[role="option"]:has-text("${label}")`).click();
    await this.page.waitForTimeout(200);
  }

  async getVisibleCommands(): Promise<string[]> {
    const items = this.dialog.locator('[role="option"]');
    const count = await items.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).locator('span.truncate').textContent();
      if (text) labels.push(text.trim());
    }
    return labels;
  }
}
