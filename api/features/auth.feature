@api @JIRA-AUTH
Feature: Authentication API

  @smoke
  Scenario: Login API returns a valid session for standard user
    When I log in with standard user credentials
    Then the response status should be 200
    And the response time should be under 2000 ms
    And the login status should be "Success"
    And the response should contain a non-empty session identifier
    And the response should contain a non-empty fid
