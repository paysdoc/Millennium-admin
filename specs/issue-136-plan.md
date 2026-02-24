# Bug: Image is shown twice on the details page

## Bug Description
On the character details page (`/characters/[id]`), the character image is rendered twice: once inside the infobox on the left side (via `EditableCharacterDetails` component, 280x280) and once in a dedicated image container on the right side (via `CharacterImage` component, 450x450). The expected behavior is that the image appears only once — on the right side of the layout.

## Problem Statement
The `EditableCharacterDetails` component renders an `<Image>` element inside a `.infobox-image` div when an `imageUrl` prop is provided. Simultaneously, the parent page (`page.tsx`) also renders a separate `CharacterImage` component in the right column with the same image URL. This results in the same character image appearing twice on the page.

## Solution Statement
Remove the image rendering block from the `EditableCharacterDetails` component and remove the `imageUrl` prop from its interface, since the image is already displayed by the dedicated `CharacterImage` component on the right side. Also remove the `imageUrl` prop being passed from the details page. This is a minimal, surgical fix that eliminates the duplicate without affecting any other functionality.

## Steps to Reproduce
1. Navigate to the application at `http://localhost:3000`
2. Click on any character name link on the overview page
3. Observe the character detail page at `/characters/[id]`
4. The same character image appears twice: once in the left infobox and once in the right column

## Root Cause Analysis
In `src/app/characters/[id]/page.tsx` (lines 58-68), the page renders a two-column layout:
- **Left column** (`character-info-left`): Renders `EditableCharacterDetails` with `imageUrl={getSupabaseStorageUrl(character.image_link)}` — this component renders the image inside the infobox (lines 81-93 of `EditableCharacterDetails.tsx`).
- **Right column** (`character-info-right`): Renders `CharacterImage` with the same image URL — this component renders the image in a dedicated container.

Both components receive the same image URL and render it independently, causing the duplicate. The `EditableCharacterDetails` component was designed to show character metadata (names, dates, biography, category, link) but also includes an image block that duplicates the dedicated `CharacterImage` component.

## Relevant Files
Use these files to fix the bug:

- **`src/components/EditableCharacterDetails.tsx`** — Contains the duplicate image rendering (lines 81-93) that needs to be removed, along with the `imageUrl` prop in its interface (line 10) and the `Image` import (line 4).
- **`src/app/characters/[id]/page.tsx`** — Passes the `imageUrl` prop to `EditableCharacterDetails` (line 60) which needs to be removed.
- **`src/app/globals.css`** — Contains the `.infobox-image` CSS class (line 357). Should be kept since `CharacterDetails.tsx` still references it.
- **`src/__tests__/app.test.tsx`** — Existing test file that imports `EditableCharacterDetails`; must still pass after changes.
- **`e2e-tests/test_character_image_display.md`** — E2E test spec for image display; step 7 already expects the image to be on the right side only (not inside the infobox), confirming this fix aligns with the intended design.

## Step by Step Tasks

### Step 1: Remove image rendering from EditableCharacterDetails component
- In `src/components/EditableCharacterDetails.tsx`:
  - Remove the `Image` import from `next/image` (line 4), since it will no longer be used.
  - Remove the `imageUrl` property from the `EditableCharacterDetailsProps` interface (line 10: `imageUrl?: string | null`).
  - Remove `imageUrl` from the destructured props in the function signature (line 22).
  - Remove the entire image rendering block (lines 81-93):
    ```tsx
    {imageUrl && (
      <div className="infobox-image">
        <Image
          src={imageUrl}
          alt={character.name}
          className="character-image"
          width={280}
          height={280}
          style={{ objectFit: 'contain' }}
          unoptimized
        />
      </div>
    )}
    ```

### Step 2: Remove imageUrl prop from the details page
- In `src/app/characters/[id]/page.tsx`:
  - Remove the `imageUrl` prop from the `EditableCharacterDetails` usage (line 60).
  - Change from: `<EditableCharacterDetails character={character} imageUrl={getSupabaseStorageUrl(character.image_link)} />`
  - Change to: `<EditableCharacterDetails character={character} />`
  - Keep the `getSupabaseStorageUrl` import since it's still used by `CharacterImage` on line 64.

### Step 3: Run validation commands
- Run `npm run lint` to check for linting errors.
- Run `npm run build` to verify no build errors.
- Run `npm test` to ensure all existing tests pass.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `CharacterDetails.tsx` component (non-editable version) also renders an image in the infobox, but it is **not imported or used anywhere** in the codebase. It is not part of this bug since it doesn't appear on any page. Cleaning it up is out of scope for this fix.
- The `.infobox-image` CSS class in `globals.css` should be preserved since `CharacterDetails.tsx` still references it.
- The E2E test spec `e2e-tests/test_character_image_display.md` step 7 already expects the image to be displayed on the right side only ("not inside the infobox"), confirming this fix aligns with the intended design.
- No new libraries are needed for this fix.
