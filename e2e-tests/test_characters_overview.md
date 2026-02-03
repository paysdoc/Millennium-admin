# E2E Test: Characters Overview Page

## User Story
As a user, I want to view the characters overview page and see either a list of characters grouped by category, or an appropriate empty state if no data is available.

## Test Steps

1. **Navigate to home page**
   - Go to http://localhost:3000
   - Wait for page to fully load

2. **Verify page header**
   - Verify the Header component is visible
   - Verify the page title "Millennium Characters Overview" is displayed
   - Take screenshot: `01_page_loaded.png`

3. **Verify page content state**
   - Check if character categories are displayed (success case)
   - OR check if "No characters found" message is displayed (empty database case)
   - OR check if an error message is displayed (error case)
   - Take screenshot: `02_content_state.png`

4. **If characters exist - verify table of contents**
   - Verify the table of contents sidebar is visible
   - Verify category links are present
   - Take screenshot: `03_table_of_contents.png`

5. **If characters exist - verify category sections**
   - Verify at least one category section is displayed
   - Verify characters are listed within sections
   - Take screenshot: `04_category_sections.png`

6. **Verify footer**
   - Scroll to bottom of page
   - Verify the Footer component is visible
   - Take screenshot: `05_footer_visible.png`

## Success Criteria
- Page loads without JavaScript errors
- Page title "Millennium Characters Overview" is visible
- Header component renders correctly
- Footer component renders correctly
- Content area shows one of:
  - Characters grouped by category with table of contents
  - "No characters found" empty state message
  - Graceful error message (not a crash)
- No unhandled exceptions in browser console

## Output Format
```json
{
  "test_name": "Characters Overview Page",
  "status": "passed|failed",
  "screenshots": [
    "/path/to/e2e-screenshots/characters_overview/01_page_loaded.png",
    "/path/to/e2e-screenshots/characters_overview/02_content_state.png",
    "/path/to/e2e-screenshots/characters_overview/03_table_of_contents.png",
    "/path/to/e2e-screenshots/characters_overview/04_category_sections.png",
    "/path/to/e2e-screenshots/characters_overview/05_footer_visible.png"
  ],
  "error": null
}
```
