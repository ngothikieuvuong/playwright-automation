import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test } from '../fixtures/api.fixtures.js';
import { OrganizationClient } from '../clients/OrganizationClient.js';
import { MetricsClient } from '../clients/MetricsClient.js';
import { getLatestIDotPeriod } from '../../shared/db/idotMetric.js';

const { Given, When, Then } = createBdd(test);

const EXPECTATIONS_PATH = new URL(
  '../../shared/data/expectationData/getOverlayMetricTypes.json',
  import.meta.url,
);

// ─── Given ───────────────────────────────────────────────────────────────────

Given('the rack node id for {string} is resolved', async ({ wsClient, apiState }, name) => {
  const org = new OrganizationClient(wsClient);
  apiState.nodeId = await org.findNodeIdByName(name);
});

Given('the latest IDotMetric period from the database is captured', async ({ apiState }) => {
  apiState.dbWindow = await getLatestIDotPeriod();
});

// ─── When ────────────────────────────────────────────────────────────────────

When(
  'I request GetNodeIDotMetric with timeFilter {string} and fix {word}',
  async ({ wsClient, apiState }, mode, fix) => {
    let metricTimeFilter;
    if (mode === 'value:latest') {
      metricTimeFilter = { value: 'latest' };
    } else if (mode === 'range:from-db') {
      if (!apiState.dbWindow) {
        throw new Error(
          'DB time window not captured — add `Given the latest IDotMetric period from the database is captured` first',
        );
      }
      metricTimeFilter = { start: apiState.dbWindow.start, end: apiState.dbWindow.end };
    } else {
      throw new Error(`Unknown timeFilter mode: "${mode}"`);
    }

    const metrics = new MetricsClient(wsClient);
    const startMs = Date.now();
    apiState.body = await metrics.getNodeIDotMetric({
      nodeId: apiState.nodeId,
      metricTimeFilter,
      fix: fix === 'true',
    });
    apiState.durationMs = Date.now() - startMs;
  },
);

// ─── Then ────────────────────────────────────────────────────────────────────

Then(
  'the response should contain a NodeData numeric value for every expected overlay metric',
  async ({ apiState }) => {
    const expected = JSON.parse(readFileSync(EXPECTATIONS_PATH, 'utf-8'));
    if (!Array.isArray(expected) || expected.length === 0) {
      throw new Error(
        'Expectation fixture is empty — populate shared/data/expectationData/getOverlayMetricTypes.json with the list of expected variableNames',
      );
    }
    // Response shape: Message.Metrics.VariableTypes[<metricId>] = { variableName, NodeData[<nodeId>], ... }
    const variableTypes = apiState.body?.Message?.Metrics?.VariableTypes ?? {};
    const byVarName = new Map();
    for (const e of Object.values(variableTypes)) {
      if (e?.variableName) byVarName.set(e.variableName, e);
    }
    const nodeId = apiState.nodeId;
    for (const variableName of expected) {
      const entry = byVarName.get(variableName);
      expect(entry, `expected variable "${variableName}" missing from response`).toBeDefined();
      const raw = entry?.NodeData?.[nodeId];
      const value = Number(raw);
      expect(
        Number.isFinite(value),
        `NodeData[${nodeId}] for "${variableName}" should be a finite number, got ${JSON.stringify(raw)}`,
      ).toBe(true);
    }
  },
);
