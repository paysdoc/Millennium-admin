# Feature: Editable Character Information

## Feature Description
Transform the character information infobox into an inline-editable component. When users click or tap on any content field in the character info box, the field transforms into an input field. The application tracks changes across all fields and displays Apply (primary styled) and Cancel (secondary styled) buttons below the info box when modifications are detected. The Cancel button resets all fields to their original values using a cached copy, while the Apply button persists the changes to the database.

## User Story
As a user
I want to edit character information directly in the infobox
So that I can quickly update character data without navigating to a separate edit form

## Problem Statement
Currently, the character detail page displays character information in a read-only format. Users cannot modify character data directly from the detail view. This creates friction when users need to make updates, as there is no editing capability at all. The application needs inline editing functionality that maintains the Wikipedia aesthetic while providing a smooth editing experience.

## Solution Statement
Create an editable version of the CharacterDetails component that:
1. Renders fields as clickable text that transforms into input fields when clicked/tapped
2. Maintains a cached copy of the original character data for reset functionality
3. Tracks changes across all editable fields using React state
4. Shows Apply and Cancel buttons only when changes are detected
5. Provides an API route to persist character updates to Supabase
6. Uses Wikipedia-style button styling (primary for Apply, secondary for Cancel)

The implementation will use React's useState and useRef hooks to manage edit state and original data caching. A new API route will handle the database update operation.

## Relevant Files
Use these files to implement the feature:

- `src/components/CharacterDetails.tsx` - Current read-only character details component; will be refactored to support edit mode
- `src/lib/characters.ts` - Character data fetching functions; needs a new function to update character data
- `src/types/character.ts` - Character type definitions; may need update payload type
- `src/app/globals.css` - Global styles; needs styles for editable fields, edit mode indicators, and button container
- `src/app/characters/[id]/page.tsx` - Character detail page; needs to pass update handler and potentially use client components
- `src/lib/supabase.ts` - Supabase client; used for database operations

### New Files
- `src/components/EditableCharacterDetails.tsx` - New client component wrapping CharacterDetails with edit functionality
- `src/components/EditableField.tsx` - Reusable component for inline-editable fields
- `src/app/api/characters/[id]/route.ts` - API route for updating character data
- `e2e-tests/test_character_edit.md` - E2E test specification for the editable character functionality

## Implementation Plan
### Phase 1: Foundation
- Create the E2E test specification to define expected behavior
- Add the `updateCharacter` function to the characters library for database updates
- Create the API route to handle PATCH requests for character updates
- Define types for the update payload

### Phase 2: Core Implementation
- Create the EditableField component for inline editing of individual fields
- Create the EditableCharacterDetails client component that wraps the editing logic
- Implement change detection to show/hide Apply and Cancel buttons
- Implement the caching mechanism for reset functionality
- Add Wikipedia-style CSS for edit mode states

### Phase 3: Integration
- Update the character detail page to use the editable component
- Test the full flow from click to edit to save/cancel
- Ensure responsive design works on mobile devices
- Verify Wikipedia styling is maintained throughout

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create E2E Test Specification
- Create `e2e-tests/test_character_edit.md`
- Define test steps to:
  - Navigate to a character detail page
  - Click on an editable field (e.g., First Names)
  - Verify the field transforms into an input
  - Modify the field value
  - Verify Apply and Cancel buttons appear
  - Test Cancel button resets the field
  - Test Apply button saves changes (verify persistence)
- Include screenshot steps for verification

### Step 2: Add Character Update Function
- Add `updateCharacter(id: string, data: Partial<CharacterRow>): Promise<Character>` function to `src/lib/characters.ts`
- Use Supabase to update the character record
- Map the updated row back to the Character interface
- Handle errors consistently with existing functions
- Return the updated character

### Step 3: Create API Route for Character Updates
- Create `src/app/api/characters/[id]/route.ts`
- Implement PATCH handler that:
  - Validates the request body
  - Calls the `updateCharacter` function
  - Returns the updated character or error response
- Follow REST conventions
- Handle 404 for non-existent characters

### Step 4: Create EditableField Component
- Create `src/components/EditableField.tsx`
- Accept props: `value`, `onChange`, `label`, `fieldName`, `type` (text, date, textarea, select)
- Render as clickable text by default
- Transform to appropriate input type when clicked
- Handle blur to exit edit mode (preserving changes in state)
- Support keyboard navigation (Enter to confirm, Escape to cancel)
- Style with Wikipedia-consistent design
- Keep component under 150 lines per coding guidelines

### Step 5: Create EditableCharacterDetails Component
- Create `src/components/EditableCharacterDetails.tsx`
- Mark as `'use client'` for client-side interactivity
- Accept props: `character: Character`, `onSave?: (updated: Character) => void`
- Use `useState` to track current field values (working copy)
- Use `useRef` to store original character data (cache for reset)
- Implement `hasChanges` computed value to detect modifications
- Use EditableField components for each editable field:
  - first_names (text)
  - birth_date (text)
  - death_date (text)
  - category (select with CATEGORY_ORDER options)
  - link (text)
  - biography (textarea)
- Render Apply and Cancel buttons only when `hasChanges` is true
- Implement `handleCancel` to reset from cache
- Implement `handleApply` to call API and update state on success
- Display loading state during save operation
- Display error messages if save fails
- Keep component under 150 lines per coding guidelines

### Step 6: Add Edit Mode Styles
- Add CSS styles to `src/app/globals.css` for:
  - Editable field hover state (`.editable-field`)
  - Field in edit mode (`.editable-field-editing`)
  - Edit input styling consistent with form inputs
  - Button container below infobox (`.infobox-actions`)
  - Loading state indicator
  - Error message styling
  - Responsive adjustments for mobile editing

### Step 7: Update Character Detail Page
- Modify `src/app/characters/[id]/page.tsx`
- Replace `CharacterDetails` with `EditableCharacterDetails`
- Since the page is a server component, the editable component handles its own client-side logic
- Optionally add revalidation after save if using server-side data fetching

### Step 8: Add Unit Tests
- Add tests to `src/__tests__/app.test.tsx` for:
  - EditableCharacterDetails component can be imported
  - EditableField component can be imported
  - API route handler exists

### Step 9: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the feature works with zero regressions
- Read `.claude/commands/test_e2e.md`, then read and execute `e2e-tests/test_character_edit.md` to validate E2E functionality

## Testing Strategy
### Unit Tests
- Test EditableField renders correctly in view mode
- Test EditableField transforms to input on click
- Test EditableField calls onChange with new value
- Test EditableCharacterDetails detects changes correctly
- Test EditableCharacterDetails resets on cancel
- Test API route validates input correctly
- Test updateCharacter function handles errors

### Integration Tests
- Test full edit flow from click to save
- Test cancel resets all modified fields
- Test API endpoint updates database correctly
- Test error handling when save fails
- Test loading states display correctly

### Edge Cases
- User clicks field but doesn't change value (no change detected)
- User makes changes then manually reverts to original value (no change detected)
- User edits multiple fields, cancels (all reset)
- User edits multiple fields, applies (all saved)
- Network error during save (error displayed, data not lost)
- Empty values for optional fields
- Very long biography text editing
- Mobile touch interactions

## Acceptance Criteria
- [ ] Clicking/tapping a content field in the infobox transforms it into an input field
- [ ] The input type matches the field type (text input for names/dates, textarea for biography, select for category)
- [ ] Apply and Cancel buttons appear below the infobox only when changes are detected
- [ ] Apply button is styled as primary (blue, clearly actionable)
- [ ] Cancel button is styled as secondary (gray/neutral)
- [ ] Cancel button resets all fields to their original values
- [ ] Apply button saves changes to the database
- [ ] Saved changes persist after page refresh
- [ ] Loading indicator shown during save operation
- [ ] Error message displayed if save fails
- [ ] Wikipedia-style design is maintained throughout
- [ ] Works correctly on mobile devices
- [ ] All validation commands pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

Read `.claude/commands/test_e2e.md`, then read and execute `e2e-tests/test_character_edit.md` to validate E2E functionality.

## Notes
- The existing `CharacterDetails.tsx` component can remain as a read-only version for potential use elsewhere, with `EditableCharacterDetails.tsx` adding the editing layer
- The Wikipedia-style `.button` and `.button-secondary` classes already exist in `globals.css` and should be reused
- Consider using optimistic updates for better UX (show changes immediately, revert on error)
- The `CATEGORY_ORDER` constant from `types/character.ts` provides the valid category options for the select dropdown
- The `type` column in the database maps to `category` in the application; the update function must handle this mapping
- Future enhancement: Add confirmation dialog before applying changes
- Future enhancement: Add field-level validation (e.g., date format validation)
- The image field is intentionally not editable inline as image uploads require different UX patterns
