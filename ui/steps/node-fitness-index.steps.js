import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui.fixtures.js';
import { NodeFitnessIndexPage } from '../pages/NodeFitnessIndexPage.js';

const { Given, Then } = createBdd(test);

// ─── Background ──────────────────────────────────────────────────────────────

Given('I open the Node Fitness Index dashboard', async ({ page }) => {
  const nfi = new NodeFitnessIndexPage(page);
  await nfi.open();
  await nfi.waitForChart();
});

// ─── Then ────────────────────────────────────────────────────────────────────

Then('the active sort field should be {string}', async ({ page }, expected) => {
  const nfi = new NodeFitnessIndexPage(page);
  expect(await nfi.getActiveSortField()).toBe(expected);
});

Then('I should see {int} compute node cells', async ({ page }, expected) => {
  const nfi = new NodeFitnessIndexPage(page);
  await expect(nfi.cells()).toHaveCount(expected);
});

Then('the cell values should be in descending order', async ({ page }) => {
  const nfi = new NodeFitnessIndexPage(page);
  const values = await nfi.getCellValues();
  expect(values, 'cell values should not be empty').not.toHaveLength(0);
  for (let i = 1; i < values.length; i++) {
    expect(values[i], `cell #${i} (${values[i]}%) must be ≤ cell #${i - 1} (${values[i - 1]}%)`)
      .toBeLessThanOrEqual(values[i - 1]);
  }
});

Then('the cells should be displayed in at least {int} distinct colours', async ({ page }, minDistinct) => {
  const nfi = new NodeFitnessIndexPage(page);
  const bgs = await nfi.getCellBackgrounds();
  const distinct = new Set(bgs);
  expect(distinct.size, `expected ≥ ${minDistinct} distinct cell colours, got ${distinct.size}`)
    .toBeGreaterThanOrEqual(minDistinct);
});

Then('I should see the {string} legend at the bottom of the page', async ({ page }, label) => {
  const legend = page.locator(`span:text-is("${label}")`).first();
  await expect(legend).toBeVisible();
  const box = await legend.boundingBox();
  const viewportH = page.viewportSize().height;
  expect(box, 'legend bounding box').not.toBeNull();
  expect(box.y, `"${label}" should sit in bottom half of viewport`).toBeGreaterThan(viewportH * 0.5);
});

Then('the {word} compute node cell should be {word}-dominant', async ({ page }, position, colour) => {
  const nfi = new NodeFitnessIndexPage(page);
  const count = await nfi.cells().count();
  const index = position === 'first' ? 0 : count - 1;
  const bg = await nfi.cells().nth(index).evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(match, `could not parse background "${bg}"`).not.toBeNull();
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (colour === 'green') {
    expect(g, `green-dominant: g=${g} should exceed r=${r} and b=${b}`).toBeGreaterThan(r);
    expect(g, `green-dominant: g=${g} should exceed b=${b}`).toBeGreaterThan(b);
  } else if (colour === 'red') {
    expect(r, `red-dominant: r=${r} should exceed g=${g} and b=${b}`).toBeGreaterThan(g);
    expect(r, `red-dominant: r=${r} should exceed b=${b}`).toBeGreaterThan(b);
  } else {
    throw new Error(`Unsupported colour assertion: ${colour}`);
  }
});
