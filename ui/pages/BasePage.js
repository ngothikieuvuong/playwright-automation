import { TIMEOUT } from '../../shared/config/config.js';

/**
 * BasePage — base class for all page objects.
 * All page classes should extend this.
 */
export class BasePage {
  constructor(page) {
    this.page = page;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  _log(method, detail) {
    console.log(`[${this.constructor.name}] ${method} → ${detail}`);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(url) {
    this._log('navigate', url);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  // ─── Interactions ────────────────────────────────────────────────────────────

  async click(selector) {
    this._log('click', selector);
    await this.page.locator(selector).click();
  }

  async fill(selector, text) {
    this._log('fill', `${selector} = "${text}"`);
    const locator = this.page.locator(selector);
    await locator.clear();
    await locator.fill(text);
  }

  // ─── Waits ───────────────────────────────────────────────────────────────────

  async waitForVisible(selector, timeout = TIMEOUT.EXPECT) {
    this._log('waitForVisible', selector);
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  async getText(selector) {
    this._log('getText', selector);
    return this.page.locator(selector).textContent();
  }

  async isVisible(selector) {
    const visible = await this.page.locator(selector).isVisible();
    this._log('isVisible', `${selector} → ${visible}`);
    return visible;
  }

  // ─── Extras ──────────────────────────────────────────────────────────────────

  async getTitle() {
    const title = await this.page.title();
    this._log('getTitle', title);
    return title;
  }

  async takeScreenshot(name) {
    this._log('takeScreenshot', `screenshots/${name}.png`);
    await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }
}
