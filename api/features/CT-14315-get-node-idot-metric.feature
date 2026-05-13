@api @CT-14315
Feature: Operational Intelligence — GetNodeIDotMetric

  `GetNodeIDotMetric` must return a numeric `NodeData[<nodeId>]` value for
  every metric listed in shared/data/expectationData/getOverlayMetricTypes.json,
  for two time-filter modes:
    1. metricTimeFilter.value = "latest"
    2. explicit metricTimeFilter.start / end taken from the most-recent
       IDotMetricValue row in the database.

  Background:
    Given the rack node id for "Rack 1 in ROW-R1-Z1-R1" is resolved

  @smoke
  Scenario Outline: GetNodeIDotMetric returns NodeData for the <description>
    When I request GetNodeIDotMetric with timeFilter "<mode>" and fix true
    Then the WebSocket response status should be "Success"
    And the response time should be under 10000 ms
    And the response should contain a NodeData numeric value for every expected overlay metric

    Examples:
      | description     | mode         |
      | latest snapshot | value:latest |

  Scenario Outline: GetNodeIDotMetric returns NodeData for the <description>
    Given the latest IDotMetric period from the database is captured
    When I request GetNodeIDotMetric with timeFilter "<mode>" and fix true
    Then the WebSocket response status should be "Success"
    And the response time should be under 10000 ms
    And the response should contain a NodeData numeric value for every expected overlay metric

    Examples:
      | description    | mode          |
      | DB time window | range:from-db |
