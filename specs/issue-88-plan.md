# Bug: "No characters found." on preview and staging environments

## Bug Description
The home page displays "No characters found." on Vercel preview and staging environments, even though the staging Supabase database contains character data. The application works correctly in local development but fails to show any characters when deployed to Vercel preview/staging environments.

**Expected behavior:** The home page should display characters grouped by category, fetched from the Supabase database at request time.

**Actual behavior:** The home page shows "No characters found." because the page was statically pre-rendered at build time with empty data.

## Problem Statement
The Next.js App Router pages that fetch data from Supabase (`src/app/page.tsx` and `src/app/characters/[id]/page.tsx`) lack a `dynamic` route segment configuration. By default, Next.js statically pre-renders async Server Components at build time. During Vercel's `next build` step, the Supabase query either fails silently (returning an empty array) or succeeds with stale/empty data. The pre-rendered static HTML is then cached and served for all subsequent requests, meaning the pages never re-fetch data at request time.

## Solution Statement
Add `export const dynamic = 'force-dynamic'` to both `src/app/page.tsx` and `src/app/characters/[id]/page.tsx`. This tells Next.js to render these pages dynamically on every request, ensuring fresh data is fetched from Supabase each time instead of serving stale pre-rendered HTML from the build step.

## Steps to Reproduce
1. Push the application code to a branch that triggers a Vercel preview deployment (e.g., `develop` or a feature branch).
2. Wait for the Vercel build and deployment to complete.
3. Open the preview/staging URL in a browser.
4. Observe the home page shows "No characters found." instead of listing characters.
5. Verify the staging Supabase database contains character data by querying it directly.

## Root Cause Analysis
The root cause is that Next.js App Router treats async Server Components as **static by default** when they have no dynamic signals (like `cookies()`, `headers()`, `searchParams`, or `export const dynamic = 'force-dynamic'`).

The data fetching in `src/app/page.tsx` uses the Supabase JS client (not the native `fetch` API), so Next.js cannot automatically detect that the data is dynamic. During `next build` on Vercel:

1. Next.js attempts to pre-render `page.tsx` (the home page) as static HTML.
2. It invokes `fetchAllCharacters()` which calls `getSupabaseClient()` and queries Supabase.
3. The build environment either cannot reach the Supabase database (network restrictions, timing issues) or the environment variables resolve to a state where the query returns empty results. The `isTableNotFoundError` handler in `fetchAllCharacters` silently returns `[]` if the table cannot be found during the build.
4. `groupCharactersByCategory([])` returns an empty `Map`.
5. The pre-rendered HTML includes `<p>No characters found.</p>`.
6. This static HTML is cached and served for **all** subsequent requests to the home page.
7. The page never re-fetches data at request time because it was pre-rendered as static content.

The same issue applies to `src/app/characters/[id]/page.tsx` which also fetches from Supabase without dynamic configuration.

## Relevant Files
Use these files to fix the bug:

- **`src/app/page.tsx`** - The home page Server Component that fetches and displays all characters. Missing `export const dynamic = 'force-dynamic'` causes static pre-rendering at build time.
- **`src/app/characters/[id]/page.tsx`** - The character detail page Server Component that fetches character data and connections. Also needs dynamic rendering to ensure fresh data on every request.
- **`src/__tests__/app.test.tsx`** - Existing test file for page components. Needs a new test to verify the `dynamic` export is correctly set on data-fetching pages.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add dynamic rendering to the home page
- Open `src/app/page.tsx`.
- Add `export const dynamic = 'force-dynamic'` after the import statements and before the `Home` function declaration.
- This single line tells Next.js to render this page on every request instead of pre-rendering at build time.

### Step 2: Add dynamic rendering to the character detail page
- Open `src/app/characters/[id]/page.tsx`.
- Add `export const dynamic = 'force-dynamic'` after the import statements and before the `CharacterPage` function declaration.
- This ensures the character detail page also fetches fresh data on every request.

### Step 3: Add tests to verify dynamic exports
- Open `src/__tests__/app.test.tsx`.
- Add test cases that verify `src/app/page.tsx` exports `dynamic` with value `'force-dynamic'`.
- Add test cases that verify `src/app/characters/[id]/page.tsx` exports `dynamic` with value `'force-dynamic'`.
- This prevents future regressions where someone might accidentally remove the dynamic export.

### Step 4: Run validation commands
- Run all validation commands listed below to confirm the fix compiles, passes linting, and all tests pass.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The fix is minimal: adding a single `export const` line to two page files and corresponding tests. No new dependencies are required.
- This is a common Next.js App Router pitfall: pages that use third-party data clients (like Supabase JS) instead of the native `fetch` API are not automatically detected as dynamic by Next.js.
- After deployment, the preview/staging pages will render on every request, ensuring fresh data from Supabase is always displayed.
- The `vercel.json` and `next.config.js` do not need any changes.
