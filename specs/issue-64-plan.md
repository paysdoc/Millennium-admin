# Chore: Remove unused Pages page

## Chore Description
Remove the 'Pages' page from the application as it is unused functionality. This includes deleting the page component itself and removing the navigation link from the header menu. Any associated test coverage for the Pages page must also be removed to prevent test failures.

## Relevant Files
Use these files to resolve the chore:

- `src/app/pages/page.tsx` - The unused Pages page component that needs to be deleted.
- `src/components/Header.tsx` - Contains the navigation menu with the "Pages" link that needs to be removed.
- `src/__tests__/app.test.tsx` - Contains a test case for importing the Pages page that must be removed to prevent test failures after deletion.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Remove the Pages menu item from the Header
- Edit `src/components/Header.tsx` to remove the "Pages" navigation link (lines 16-18).
- The `<li>` element containing `<Link href="/pages">Pages</Link>` should be deleted entirely.
- Ensure the remaining navigation links (Home, Users, Settings) are preserved and properly formatted.

### Step 2: Delete the Pages page directory
- Delete the entire `src/app/pages/` directory which contains `page.tsx`.
- This removes the unused page component from the application routing.

### Step 3: Update the test file to remove Pages page test
- Edit `src/__tests__/app.test.tsx` to remove the test case "Pages page can be imported" (lines 20-24).
- This test imports from `../app/pages/page` which will no longer exist after Step 2.
- Ensure the remaining tests are properly formatted and the test file structure remains valid.

### Step 4: Run validation commands
- Run all validation commands to verify the chore is complete with zero regressions.
- Ensure linting passes, build succeeds, and all tests pass.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The Pages page appears to be placeholder/stub functionality with static content ("Manage your pages here", sample data).
- No e2e tests reference the Pages page, so no updates to `e2e-tests/` are required.
- The README.md references `pages/` in the project structure documentation. This could optionally be updated, but since it's a general description of the app structure and other stubs (users, settings) remain, it may not require changes.
