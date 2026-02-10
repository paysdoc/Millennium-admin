# E2E Test: Character Edit Functionality

Test the inline editing functionality for character information in the Millennium Admin application.

## User Story

As a user
I want to edit character information directly in the infobox
So that I can quickly update character data without navigating to a separate edit form

## Test Steps

1. Navigate to the `Application URL`
2. Take a screenshot of the initial state (home page with character overview)
3. **Verify** at least one category section is visible
4. **Verify** character names are displayed as clickable links

5. Click on a character name link to navigate to character detail page
6. Take a screenshot after navigation
7. **Verify** navigation to the character detail page occurred (URL contains `/characters/`)
8. **Verify** the character infobox is displayed with editable fields

9. Click on the "First Names" field value in the infobox
10. Take a screenshot showing the field transformed into an input
11. **Verify** the field has transformed into an editable input field

12. Modify the field value by adding " Test" to the existing value
13. Click outside the field to exit edit mode
14. Take a screenshot showing the Apply and Cancel buttons appeared
15. **Verify** Apply and Cancel buttons are visible below the infobox

16. Click the Cancel button
17. Take a screenshot after cancel
18. **Verify** the field value has been reset to the original value
19. **Verify** Apply and Cancel buttons are no longer visible

20. Click on the "First Names" field value again
21. Modify the field value by adding " Edited" to the value
22. Click outside the field to exit edit mode
23. **Verify** Apply and Cancel buttons are visible

24. Click the Apply button
25. Take a screenshot after apply (may show loading state briefly)
26. **Verify** the changes have been saved (buttons disappear, value persists)

27. Refresh the page
28. Take a screenshot after refresh
29. **Verify** the edited value persists after page refresh

30. Click on the "First Names" field value
31. Remove " Edited" from the value to restore original
32. Click outside the field to exit edit mode
33. Click the Apply button to save restoration
34. Take a screenshot of restored state

## Success Criteria
- Clicking a content field transforms it into an editable input
- Apply and Cancel buttons appear only when changes are detected
- Cancel button resets all fields to original values
- Apply button saves changes to the database
- Changes persist after page refresh
- Wikipedia-style design is maintained throughout editing
- 10 screenshots are taken

## Notes
- The test should handle potential network delays during save operations
- If a save error occurs, verify the error message is displayed
- The image field should NOT be editable
