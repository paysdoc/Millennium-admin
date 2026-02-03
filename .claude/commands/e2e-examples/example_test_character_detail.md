# E2E Test: Character Detail Page

Test the character detail page functionality in the Millennium Admin application.

## User Story

As a user
I want to view detailed information about a character including their connections
So that I can understand a character's full profile and relationships at a glance

## Test Steps

1. Navigate to the `Application URL`
2. Take a screenshot of the initial state (home page with character overview)
3. **Verify** the page title is "Millennium Admin"
4. **Verify** at least one category section is visible
5. **Verify** character names are displayed as clickable links

6. Click on a character name link
7. Take a screenshot after navigation
8. **Verify** navigation to the character detail page occurred (URL contains `/characters/`)
9. **Verify** the character details section is displayed:
   - Character name heading
   - Infobox with character fields (first names, dates, biography, category, link)

10. Take a screenshot of the character details section
11. **Verify** the connections section is displayed:
    - Section heading for connections
    - Connections table (or empty state message if no connections)

12. Take a screenshot of the connections section
13. **Verify** the "Back to Overview" link is present
14. Click the "Back to Overview" link
15. Take a screenshot after returning to overview
16. **Verify** navigation back to home page occurred

## Success Criteria
- Character links on overview page navigate to detail page
- Detail page displays character information in infobox format
- Detail page displays connections table
- Back navigation works correctly
- 5 screenshots are taken
- Page handles characters with no connections gracefully
