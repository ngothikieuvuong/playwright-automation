-- Latest measurement window in IDotMetricValue.
-- Used by CT-14315 Scenario 2 to derive metricTimeFilter.start / .end.
SELECT "Period_Start"::text || '|' || "Period_End"::text
FROM "IDotMetricValue"
ORDER BY "Period_End" DESC
LIMIT 1;
