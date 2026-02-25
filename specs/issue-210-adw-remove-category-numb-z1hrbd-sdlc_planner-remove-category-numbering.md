# Feature: Remove Category Numbering

## Metadata
issueNumber: `210`
adwId: `remove-category-numb-z1hrbd`
issueJson: `{"number":210,"title":"Remove category numbering","body":"Remove the numbering in the list of categories in the overview.","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-02-25T05:58:16Z","comments":[],"actionableComment":null}`

## Feature Description
Remove the numeric prefixes (1, 2, 3, ...) that currently appear before each category name in the Table of Contents on the overview (home) page. Currently the TableOfContents component renders each entry as `{index + 1} {categoryName}` (e.g., "1 Royalty", "2 Statesmen"). After this change, entries will display only the category name without the leading number.

## User Story
As a user viewing the characters overview page
I want to see category names without numbering in the table of contents
So that the list looks cleaner and is consistent with a Wikipedia-style presentation

## Problem Statement
The Table of Contents on the overview page displays a numeric prefix before each category name (e.g., "1 Royalty", "2 Statesmen"). This numbering is redundant since the `<ol>` element already implies order, and the explicit numbers add visual clutter. The issue requests removing these numbers for a cleaner appearance.

## Solution Statement
Remove the `{index + 1}` expression from the `TableOfContents` component's JSX. Since the component already uses an `<ol>` (ordered list) element, native list numbering via CSS can optionally be restored, but since the current CSS sets `list-style: none`, the simplest approach is to just remove the manual number prefix and keep the list unstyled. The `index` parameter in the `.map()` callback can also be removed since it will no longer be used. Update the existing E2E test that validates TOC entries to no longer expect numbered prefixes.

## Relevant Files
Use these files to implement the feature:

- `src/components/TableOfContents.tsx` — Contains the `{index + 1}` numbering logic on line 17 that needs to be removed.
- `src/app/globals.css` (lines 210–244) — Contains the `.toc-list` styles including `list-style: none`. No changes needed unless native `<ol>` numbering is desired.
- `src/app/page.tsx` — Home page that renders `<TableOfContents>`. No changes needed but useful for context.
- `e2e-tests/test_category_names.md` — E2E test spec that currently expects "1 Royalty" format in the TOC. Needs updating to reflect the new format without numbers.
- `e2e-tests/characters-overview.spec.ts` — Playwright E2E spec for the overview page. May need verification that no assertions depend on numbered TOC entries.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.

### New Files
- `e2e-tests/test_remove_category_numbering.md` — New E2E test file to validate that category numbering has been removed from the Table of Contents.

## Implementation Plan
### Phase 1: Foundation
Review the current `TableOfContents.tsx` component to confirm the exact numbering logic and understand how the `index` variable is used. Confirm that no other component or test depends on the numbered format.

### Phase 2: Core Implementation
Remove the `{index + 1}` prefix from the JSX in `TableOfContents.tsx`. Remove the unused `index` parameter from the `.map()` callback. This is a single-line change in a single file.

### Phase 3: Integration
Update the existing E2E test spec `e2e-tests/test_category_names.md` to remove expectations of numbered TOC entries. Create a new E2E test to validate the numbering has been removed. Verify all existing tests and the build still pass.

## Step by Step Tasks

### Step 1: Create E2E test specification
- Create `e2e-tests/test_remove_category_numbering.md` with steps to validate that the Table of Contents on the home page no longer shows numeric prefixes before category names.
- The test should:
  1. Navigate to `http://localhost:3000`
  2. Take a screenshot of the Table of Contents
  3. Verify that TOC entries display category names without numeric prefixes (e.g., "Royalty" instead of "1 Royalty")
  4. Verify that clicking a TOC link still scrolls to the correct category section

### Step 2: Remove numbering from TableOfContents component
- Edit `src/components/TableOfContents.tsx`
- On line 14, change `{categories.map((category, index) => (` to `{categories.map((category) => (`
- On line 17, change `{index + 1} {categoryNames.get(category) ?? category}` to `{categoryNames.get(category) ?? category}`

### Step 3: Update existing E2E test spec for category names
- Edit `e2e-tests/test_category_names.md`
- In section "2. Home Page — Table of Contents", update the expected format from `"1 Royalty"` to just `"Royalty"` (remove numbered prefix expectations)
- Update step 4: remove the expectation that "Each TOC entry should show the index followed by the full category name"

### Step 4: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to run tests and validate zero regressions

## Testing Strategy
### Unit Tests
- The existing import test in `src/__tests__/app.test.tsx` will verify the `TableOfContents` component still exports correctly.
- No new unit tests are needed since this is a simple removal of a display element.

### Edge Cases
- Categories with fallback names (when `categoryNames.get(category)` returns `undefined`, the component falls back to the raw `category` key) — ensure the fallback still works without the number prefix.
- Empty categories list — the component should still render an empty list without errors.
- Single category — the list should display one item without a number.

## Acceptance Criteria
- The Table of Contents on the overview page displays category names without numeric prefixes.
- TOC links still navigate to the correct category sections.
- The `<ol>` structure is preserved (no HTML element changes).
- All existing tests pass without modification (except updated E2E specs).
- The build completes successfully with no errors.
- No visual regressions in the rest of the overview page.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This is a minimal change — only `TableOfContents.tsx` needs a code change. The CSS (`globals.css`) already has `list-style: none` on `.toc-list`, so removing the manual number won't reveal native `<ol>` numbering.
- The `<ol>` element is kept rather than changed to `<ul>` to preserve semantic ordering intent, even though numbers are not visually displayed.
