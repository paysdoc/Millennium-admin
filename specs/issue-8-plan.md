# Chore: Rename Header to "Millennium Characters"

## Chore Description
Rename the main header/logo text from "Millennium Admin" to "Millennium Characters" across all pages of the application. The header appears as a clickable logo link in the top navigation bar on every page. This is a straightforward text replacement that must be applied consistently across all page components.

## Relevant Files
Use these files to resolve the chore:

### Files to Modify
- `src/app/page.tsx` — Home page component containing the header with logo text "Millennium Admin" on line 10. The logo is rendered as a Link component with the className "logo".
- `src/app/pages/page.tsx` — Pages management page containing the same header structure. Logo text on line 10.
- `src/app/users/page.tsx` — Users management page containing the same header structure. Logo text on line 10.
- `src/app/settings/page.tsx` — Settings page containing the same header structure. Logo text on line 10.

### Reference Files (Read Only)
- `guidelines/coding_guidelines.md` — Coding standards for the project (no specific impact on this text change)
- `src/app/globals.css` — Contains the `.header` and `.header-content` styles (no changes needed)

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Update Header Logo Text in Home Page
- Open `src/app/page.tsx`
- Locate the Link component with className "logo" inside the header (line 9-11)
- Change the text content from "Millennium Admin" to "Millennium Characters"
- The code change should be:
  ```tsx
  // Before:
  <Link href="/" className="logo">
    Millennium Admin
  </Link>

  // After:
  <Link href="/" className="logo">
    Millennium Characters
  </Link>
  ```

### 2. Update Header Logo Text in Pages Page
- Open `src/app/pages/page.tsx`
- Locate the Link component with className "logo" inside the header (line 9-11)
- Change the text content from "Millennium Admin" to "Millennium Characters"

### 3. Update Header Logo Text in Users Page
- Open `src/app/users/page.tsx`
- Locate the Link component with className "logo" inside the header (line 9-11)
- Change the text content from "Millennium Admin" to "Millennium Characters"

### 4. Update Header Logo Text in Settings Page
- Open `src/app/settings/page.tsx`
- Locate the Link component with className "logo" inside the header (line 9-11)
- Change the text content from "Millennium Admin" to "Millennium Characters"

### 5. Run Validation Commands
- Execute all validation commands to verify the changes work correctly with zero regressions
- Ensure all pages render correctly with the new header text

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the application to verify no build errors
- `npm test` — Run tests to validate the chore is complete with zero regressions (if tests exist)

## Notes
- **Scope Limitation**: This chore only changes the header logo text. Other references to "Millennium Admin" (such as in the page title metadata in `layout.tsx`, footer copyright text, or settings form defaults) are intentionally NOT changed unless explicitly requested.
- **Code Duplication Observation**: The header is duplicated across all four page components rather than being a shared component. While this creates maintenance overhead, refactoring the header into a shared component is outside the scope of this chore. A separate issue could be created to address this technical debt.
- **No Style Changes**: The header styling in `globals.css` does not need modification as this is purely a text change.
- **Quick Verification**: After implementation, manually verify by running `npm run dev` and navigating to each page (/, /pages, /users, /settings) to confirm the header displays "Millennium Characters".
