# Feature: Add Images to Character Details Page

## Feature Description
Enhance the character detail page by moving the character image from inside the infobox to a dedicated space on the right side of the character description section. The layout will be restructured so that the character information infobox takes up two-thirds of the section width, with the image displayed in the remaining one-third space to the right. Both elements will align at the top, and the image will respect a maximum width of 450px while maintaining its aspect ratio.

## User Story
As a user
I want to see character images prominently displayed next to their information
So that I can visually identify characters while reading their details

## Problem Statement
Currently, character images are displayed inside the infobox component at a small 280x280 size. The image is embedded within the character information, which limits visibility and doesn't take advantage of the available horizontal space on the detail page. Users would benefit from a larger, more prominent image display that complements rather than competes with the character information.

## Solution Statement
Restructure the "Character Information" section layout to use a two-column design:
1. **Left column (2/3 width)**: Character information infobox (without the embedded image)
2. **Right column (1/3 width)**: Character image displayed prominently with a maximum width of 450px

The image will be removed from the `CharacterDetails` component and instead rendered as a sibling element within a flex container that aligns both elements at the top. CSS will be updated to create the new responsive layout.

## Relevant Files
Use these files to implement the feature:

- `src/app/characters/[id]/page.tsx` - Character detail page; needs layout restructuring to add the image container alongside the infobox
- `src/components/CharacterDetails.tsx` - CharacterDetails component; needs removal of the embedded image rendering
- `src/app/globals.css` - Global styles; needs new CSS for the two-column layout and image styling
- `src/types/character.ts` - Character type definitions; reference for `image_link` field (no changes needed)
- `e2e-tests/test_character_detail.md` - Existing E2E test; may need updates to verify new image location

### New Files
- `src/components/CharacterImage.tsx` - New component to display the character image with proper styling and constraints
- `e2e-tests/test_character_image_display.md` - E2E test specification for the new image display feature

## Implementation Plan
### Phase 1: Foundation
- Create the E2E test specification to define expected behavior for the new image layout
- Create the `CharacterImage` component to handle image display with proper constraints (max 450px, aspect ratio preservation)

### Phase 2: Core Implementation
- Remove the embedded image from the `CharacterDetails` component
- Update the character detail page layout to use a two-column flex container
- Add CSS styles for the new layout (2/3 - 1/3 split, top alignment)

### Phase 3: Integration
- Ensure responsive design works on mobile devices (stack vertically on smaller screens)
- Test with characters that have images and without images
- Verify the layout maintains consistency with the Wikipedia-style design

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create E2E Test Specification
- Create `e2e-tests/test_character_image_display.md`
- Define test steps to:
  - Navigate to a character detail page for a character with an image
  - Verify the character infobox is displayed on the left side
  - Verify the character image is displayed on the right side
  - Verify the image does not exceed 450px width
  - Verify the infobox and image align at the top
  - Take screenshots for verification

### Step 2: Create CharacterImage Component
- Create `src/components/CharacterImage.tsx`
- Accept props: `imageUrl: string | null`, `characterName: string`
- Use Next.js `Image` component for optimized loading
- Apply max-width of 450px while preserving aspect ratio
- Handle null/undefined image gracefully (render nothing)
- Add appropriate CSS class for styling
- Keep component under 50 lines (simple presentation component)

### Step 3: Remove Image from CharacterDetails Component
- Edit `src/components/CharacterDetails.tsx`
- Remove the `Image` import from `next/image`
- Remove the `infobox-image` div block that renders the image (lines 13-25)
- Keep all other character information display logic intact

### Step 4: Add CSS Styles for New Layout
- Edit `src/app/globals.css`
- Add new styles:
  - `.character-info-section` - Flex container for the two-column layout
  - `.character-info-left` - Left column taking 2/3 width
  - `.character-info-right` - Right column taking 1/3 width
  - `.character-image-container` - Container for the image
  - `.character-detail-image` - Image styling (max-width 450px, height auto)
- Ensure top alignment with `align-items: flex-start`
- Update `.infobox` to not float when inside the new layout
- Add responsive styles to stack columns on mobile (<768px)

### Step 5: Update Character Detail Page Layout
- Edit `src/app/characters/[id]/page.tsx`
- Import the new `CharacterImage` component
- Wrap the "Character Information" section content in a new flex container
- Structure:
  - `<div className="character-info-section">`
    - `<div className="character-info-left">` containing `<CharacterDetails>`
    - `<div className="character-info-right">` containing `<CharacterImage>`
- Pass `character.image_link` and `character.name` to the CharacterImage component

### Step 6: Update Existing E2E Test
- Edit `e2e-tests/test_character_detail.md`
- Update the character details verification step to reflect that the image is now displayed separately
- Add a verification step for the image being in the right column (if character has an image)

### Step 7: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the feature works with zero regressions

### Step 8: Execute E2E Test
- Read `.claude/commands/test_e2e.md`
- Execute the new `e2e-tests/test_character_image_display.md` test
- Verify all test steps pass and screenshots show correct layout

## Testing Strategy
### Unit Tests
- Test CharacterImage component renders correctly with valid image URL
- Test CharacterImage component handles null/undefined image gracefully
- Test CharacterDetails component no longer renders an image

### Integration Tests
- Test character detail page renders with the new two-column layout
- Test responsive layout stacks correctly on mobile viewports
- Test page layout is consistent whether character has an image or not

### Edge Cases
- Character with no image (image_link is null) - right column should be empty or hidden
- Character with a very tall image - should maintain aspect ratio without breaking layout
- Character with a very wide image - should be constrained to 450px max width
- Mobile viewport - columns should stack vertically
- Character with very long biography text - layout should remain stable

## Acceptance Criteria
- [ ] Character image is displayed to the right of the character information infobox
- [ ] Character information infobox takes up approximately 2/3 of the section width
- [ ] Character image takes up approximately 1/3 of the section width
- [ ] Image and infobox align at the top of the section
- [ ] Image does not exceed 450px in width
- [ ] Image maintains its aspect ratio
- [ ] Layout handles characters without images gracefully (no broken layout)
- [ ] Layout is responsive and stacks vertically on mobile devices
- [ ] Wikipedia-style design consistency is maintained
- [ ] All validation commands pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- Read `.claude/commands/test_e2e.md`, then read and execute `e2e-tests/test_character_image_display.md` to validate the new image display functionality
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- The `image_link` field contains URLs to Supabase bucket images, which are already configured with the `unoptimized` prop in the current implementation - this may need to be retained depending on Supabase image domain configuration
- The existing infobox CSS uses `float: left` which will need to be overridden or removed when inside the new flex container
- Consider adding a placeholder or graceful empty state for the right column when a character has no image to maintain layout consistency
- Future enhancement: Add lightbox functionality to view the image in full size on click
