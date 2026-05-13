/**
 * Wraps `GetNodeIDotMetric` (and friends as we grow this).
 *
 * Per ticket CT-14315 the metricTimeFilter has two shapes:
 *   - { value: "latest" }            ← Scenario 1
 *   - { start: "YYYY-MM-DD HH:MM:SS", end: "YYYY-MM-DD HH:MM:SS" }   ← Scenario 2
 */
export class MetricsClient {
  constructor(wsClient) {
    this.ws = wsClient;
  }

  getNodeIDotMetric({ nodeId, metricTimeFilter, fix = true } = {}) {
    if (!nodeId) throw new Error('MetricsClient.getNodeIDotMetric: nodeId is required');
    if (!metricTimeFilter) throw new Error('MetricsClient.getNodeIDotMetric: metricTimeFilter is required');
    return this.ws.call('GetNodeIDotMetric', { nodeId, metricTimeFilter, fix });
  }
}
