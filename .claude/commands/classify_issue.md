# Github Issue Command Selection

Based on the `Github Issue` below, follow the `Instructions` to select the appropriate command to execute based on the `Command Mapping`.

## Instructions

- Based on the details in the `Github Issue`, select the appropriate command to execute.
- Respond exclusively with '/' followed by the command to execute.
- Use the command mapping to help you decide which command to respond with.
- Think hard about the command to execute.

## Command Mapping

- Respond with `/chore` if the issue is a chore that is **unlikely to require new or modified tests**. Chores include:
  - Documentation-only changes (README, docs, comments)
  - Configuration file updates (tsconfig, eslint, prettier configs)
  - Dependency version updates
  - CI/CD pipeline changes
  - Code style/formatting changes
  - Refactoring with no functional changes
  - File/folder reorganization
  - **Important:** If the change might require new tests or modifications to existing tests, classify it as `/feature` instead.
- Respond with `/bug` if the issue is a bug fix. Bug fixes address existing functionality that is not working as expected.
- Respond with `/feature` if the issue is a feature or enhancement. Features add new functionality or modify existing behavior in ways that may require new tests.
- Respond with `/pr_review` if the issue is requesting a PR review, code review, or review-related changes.
- Respond with `0` if the issue isn't any of the above.

## Github Issue

$ARGUMENTS