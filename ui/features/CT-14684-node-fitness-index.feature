@ui @CT-14684
Feature: Operational Intelligence — Node Fitness Index

  Operational Intelligence > Metric Type > Node Fitness Index renders a heatmap
  of compute nodes coloured by their NFI value, sorted descending by value.

  Background:
    Given I open the Node Fitness Index dashboard

  @smoke
  Scenario Outline: Node Fitness Index defaults to sorting by "<sort_field>"
    Then the active sort field should be "<sort_field>"

    Examples:
      | sort_field |
      | Value      |

  @smoke
  Scenario Outline: Compute node cells render with distinct colours in descending value order
    Then I should see <expected_count> compute node cells
    And the cell values should be in descending order
    And the cells should be displayed in at least <distinct_colors> distinct colours

    Examples:
      | expected_count | distinct_colors |
      | 64             | 10              |

  Scenario Outline: Cell colour matches the NFI scale shown at the bottom of the chart
    Then I should see the "NFI Scale" legend at the bottom of the page
    And the <position> compute node cell should be <color>-dominant

    Examples:
      | position | color |
      | first    | green |
      | last     | red   |
