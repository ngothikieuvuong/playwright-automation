# expectationData

Static fixtures that tests assert response payloads against. Each file is a JSON
array of strings (or richer structure if a test needs it).

## `getOverlayMetricTypes.json`

The list of `variableName` values that `GetNodeIDotMetric` must return a numeric
`NodeData[<nodeId>]` for, used by CT-14315.

**Source of truth.** Drop in the JSON array of variable names — either:
- export from a previous test run (Postman / `wscat`), or
- once `GetOverlayMetricTypes` is healthy on the local BE, run it and snapshot the
  `Message.VariableTypes[*].Name` values.

Until this file has at least one name, the CT-14315 scenario's per-metric
assertion fails fast with "Expectation fixture is empty — populate
shared/data/expectationData/getOverlayMetricTypes.json".
