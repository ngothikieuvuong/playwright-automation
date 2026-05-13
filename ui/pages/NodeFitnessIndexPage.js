import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { APP_PATH, BASE_URL, TIMEOUT } from '../../shared/config/config.js';

/**
 * Selector strategy:
 *   1. data-testid     — preferred, but NOT YET present on this view.
 *      Flagged for the FE team to add (heatmap cell, sort button, NFI scale legend).
 *   2. semantic CSS    — used here as fallback (e.g. `.heatmap-cell`, `bg-primary-500`).
 *   3. role / text     — used for the sidebar tabs (`Metric Type`, sort field buttons).
 *
 * No XPath / no `[index]` selectors / no `page.waitForTimeout()`.
 */
const SELECTORS = {
  navbarLogo:        'tql-navbar-logo',
  metricTreeItem:    (label) => `div.cursor-pointer:has-text("${label}")`,
  heatmapCell:       '.heatmap-cell',
  nfiScaleLabel:     'span:text-is("NFI Scale")',
};

// Direct deep-link to the Operational Intelligence dashboard.
// Using URL navigation instead of hover-and-click on the sidebar makes the
// test resilient to non-Chromium engines where hover-to-expand is flaky.
const OPERATIONAL_INTELLIGENCE_PATH = `${APP_PATH}#/dashboards/carbon-transparency/operational-intelligence`;

const SORT_FIELDS = ['Name', 'ID', 'Value'];
const ACTIVE_SORT_CLASS_RE = /bg-primary-500/;

export class NodeFitnessIndexPage extends BasePage {
  /**
   * Navigate to Operational Intelligence → Metric Type → Node Fitness Index.
   * Relies on the `ui` project's storageState — no UI login is performed here.
   */
  async open() {
    // Direct deep-link navigation. Every test gets a fresh Angular state without
    // depending on the worker page's previous URL or sidebar hover-to-expand
    // (which races on Firefox / WebKit after several reloads).
    await this.navigate(`${BASE_URL}${OPERATIONAL_INTELLIGENCE_PATH}`);
    await this.page.locator(SELECTORS.navbarLogo).waitFor({ state: 'visible', timeout: TIMEOUT.APP_BOOT });
    await this.page.getByRole('button', { name: 'Metric Type', exact: true }).click();
    await this.page.locator(SELECTORS.metricTreeItem('Node Fitness Index')).first().click();
  }

  /**
   * Wait for the heatmap to finish rendering. The page shows a loading spinner
   * until cells appear, so we poll until at least one cell is visible and the
   * count is stable.
   */
  async waitForChart() {
    await this.page.locator(SELECTORS.heatmapCell).first().waitFor({ state: 'visible', timeout: TIMEOUT.NAVIGATION });
    await expect
      .poll(async () => this.cells().count(), { timeout: TIMEOUT.NAVIGATION, intervals: [200, 500, 1000] })
      .toBeGreaterThan(0);
  }

  cells() {
    return this.page.locator(SELECTORS.heatmapCell);
  }

  nfiScaleLegend() {
    return this.page.locator(SELECTORS.nfiScaleLabel);
  }

  /** Returns the parsed numeric percentage values of every heatmap cell, in DOM order. */
  async getCellValues() {
    const texts = await this.cells().allTextContents();
    return texts.map((t) => Number.parseFloat(t.replace('%', '').trim()));
  }

  /** Returns the computed `rgb(r, g, b)` background color string of every cell. */
  async getCellBackgrounds() {
    return this.cells().evaluateAll((els) => els.map((e) => window.getComputedStyle(e).backgroundColor));
  }

  /**
   * The Sort row exposes three buttons (Name / ID / Value). The active one carries
   * the Tailwind `bg-primary-500` class. Returns the label of the active button,
   * or null when none is active.
   */
  async getActiveSortField() {
    for (const label of SORT_FIELDS) {
      const btn = this.page.getByRole('button', { name: label, exact: true });
      if ((await btn.count()) === 0) continue;
      const cls = (await btn.first().getAttribute('class')) ?? '';
      if (ACTIVE_SORT_CLASS_RE.test(cls)) return label;
    }
    return null;
  }
}
