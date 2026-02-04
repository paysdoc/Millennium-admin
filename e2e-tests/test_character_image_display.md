# E2E Test: Character Image Display on Detail Page

Test the character image display layout on the character detail page.

## User Story

As a user
I want to see character images prominently displayed next to their information
So that I can visually identify characters while reading their details

## Test Steps

1. Navigate to the `Application URL`
2. Take a screenshot of the initial state (home page)
3. **Verify** the page title is "Millennium Admin"

4. Click on a character name link
5. Take a screenshot after navigation to detail page
6. **Verify** navigation to the character detail page occurred (URL contains `/characters/`)

7. **Verify** the character information section layout:
   - The infobox is displayed on the left side of the section
   - If the character has an image, it is displayed on the right side (not inside the infobox)

8. Take a screenshot of the character information section

9. **Verify** the character image display (if character has an image):
   - The image is rendered in the right column
   - The image width does not exceed 450px
   - The infobox and image align at the top

10. Take a screenshot of the full page layout

11. **Verify** the page layout is responsive:
    - On desktop, infobox and image are side by side
    - Layout maintains Wikipedia-style design consistency

12. Navigate back to the overview page
13. Take a screenshot of the final state

## Success Criteria
- Character infobox is displayed on the left side (approximately 2/3 width)
- Character image is displayed on the right side (approximately 1/3 width)
- Image and infobox align at the top of the section
- Image does not exceed 450px maximum width
- Image maintains aspect ratio
- Layout handles characters without images gracefully
- 5 screenshots are taken
