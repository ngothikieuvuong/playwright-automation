@api @smoke @ws-smoke
Feature: WebSocket transport smoke

  Confirms the worker-scoped fixture (HTTP login + WS connect + SetOrg) is
  healthy by issuing one trivial Async call.

  Scenario: GetOrgs returns at least one organization over WS
    When I call "GetOrgs" over the WebSocket
    Then the WebSocket response status should be "Success"
    And the response should contain at least 1 organization
