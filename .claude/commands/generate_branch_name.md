# Generate Git Branch Name

Based on the `Instructions` below, take the `Variables` follow the `Run` section to generate a concise Git branch name following the specified format. Then follow the `Report` section to report the results of your work.

## Variables

issueClass: $1
adwId: $2
issue: $3

## Instructions

- Generate a branch name in the format: `<issueClass>-issue-<issueNumber>-adw-<adwId>-<concise_name>`
- The `<concise_name>` should be:
  - 3-6 words maximum
  - All lowercase
  - Words separated by hyphens
  - Descriptive of the main task/feature
  - No special characters except hyphens
- Examples:
  - `feat-issue-123-adw-a1b2c3d4-add-user-auth`
  - `bug-issue-456-adw-e5f6g7h8-fix-login-error`
  - `chore-issue-789-adw-i9j0k1l2-update-dependencies`
  - `test-issue-323-adw-m3n4o5p6-fix-failing-tests`
- Extract the issue number, title, and body from the issue JSON

## Run

Generate the branch name based on the instructions above.
Do NOT run any git commands. Only generate the branch name string.

## Report

Return ONLY the branch name (no other text)
