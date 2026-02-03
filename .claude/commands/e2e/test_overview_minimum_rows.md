# E2E Test: Overview Page Minimum Rows

Test that the overview page displays at least 10 character rows from the database.

## User Story

As a user
I want to see character data on the overview page
So that I can browse the Millennium characters collection

## Test Steps

1. Navigate to the `Application URL` (home page)
2. Take a screenshot of the initial page load
3. **Verify** the page title contains "Millennium Characters Overview"
4. **Verify** at least one category section is visible
5. **Verify** at least 10 character rows are displayed across all categories
6. Take a screenshot showing the character rows
7. **Verify** each character row displays at least a name

## Success Criteria
- Overview page loads successfully
- At least 10 character rows are visible on the page
- Characters are grouped by category sections
- No error messages are displayed
- 2 screenshots are taken
