@ui @auth
Feature: User Authentication

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter valid credentials
    And I click the login button
    Then I should be redirected away from the login page

  Scenario: Navigate to BOTs via System Models menu
    Given I am on the login page
    When I enter valid credentials
    And I click the login button
    And I hover over the logo to expand the sidebar
    And I hover over System Models menu
    And I click on BOTs
    Then I should see the BOTs page
    And I should see 24 items per page
