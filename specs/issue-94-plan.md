# Bug: Staging environment incorrectly states "No characters found."

## Bug Description
The home page on preview and staging environments displays "No characters found." even though the staging Supabase database contains character data. The expected behavior is that the page should dynamically fetch and display all characters from the database on each request. Instead, the page serves a stale, statically-generated version that was built when the data may not have been available or when the fetch response was cached.

## Problem Statement
The home page (`src/app/page.tsx`) and character detail page (`src/app/characters/[id]/page.tsx`) are Next.js App Router server components that fetch data from Supabase. In Next.js 14, server components are **statically rendered at build time by default**. Neither page opts into dynamic rendering — there is no `export const dynamic` or `export const revalidate` configuration. As a result, the Supabase query runs once during `next build`, the HTML is cached, and all subsequent requests serve the stale static page regardless of the current database state.

## Solution Statement
Add `export const dynamic = 'force-dynamic'` to every page that fetches data from Supabase. This tells Next.js to render these pages dynamically on every request, ensuring fresh data is always fetched from the database. This is the minimal, targeted fix — it only changes the rendering strategy for data-driven pages without modifying any data-fetching logic or component structure.

## Steps to Reproduce
1. Deploy the application to Vercel staging/preview environment (push to `develop` or a feature branch).
2. Ensure the staging Supabase database has character data populated.
3. Navigate to the staging URL home page.
4. Observe "No characters found." is displayed despite the database containing data.
5. The character detail page (`/characters/[id]`) would similarly show stale or missing data.

## Root Cause Analysis
Next.js 14 App Router statically generates server component pages at build time by default. The Supabase JS client (`@supabase/supabase-js` v2) internally uses the native `fetch` API, which Next.js 14 patches to add automatic caching (`force-cache` by default). This creates a two-layer caching problem:

1. **Page-level static generation**: The page HTML is generated once during `next build` and served as a static asset for all requests.
2. **Data Cache**: The `fetch` calls made by the Supabase client are cached by Next.js's Data Cache at build time.

When the build runs on Vercel:
- If the database was empty at build time, or the env vars were misconfigured during the build step, or the fetch was cached with an empty/error response, the page renders "No characters found."
- This static HTML is served for all subsequent requests — the database is never queried again until a new build/deployment occurs.

The pages that fetch from Supabase (`src/app/page.tsx` and `src/app/characters/[id]/page.tsx`) lack any dynamic rendering configuration (`export const dynamic = 'force-dynamic'` or `export const revalidate`), so they default to static generation.

## Relevant Files
Use these files to fix the bug:

- `src/app/page.tsx` — The home page server component. Fetches all characters via `fetchAllCharacters()` and displays them grouped by category. Shows "No characters found." when `categories.length === 0`. **Needs `export const dynamic = 'force-dynamic'` to render dynamically on every request.**
- `src/app/characters/[id]/page.tsx` — The character detail page. Fetches a single character and its connections from Supabase. **Needs `export const dynamic = 'force-dynamic'` to render dynamically on every request.**
- `src/__tests__/app.test.tsx` — Existing test file for page components. **Needs a new test to verify the `dynamic` export is present on data-fetching pages.**

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add dynamic rendering to the home page
- Open `src/app/page.tsx`.
- Add `export const dynamic = 'force-dynamic'` before the default export function.
- This tells Next.js to render this page dynamically on every request instead of statically generating it at build time.

### Step 2: Add dynamic rendering to the character detail page
- Open `src/app/characters/[id]/page.tsx`.
- Add `export const dynamic = 'force-dynamic'` before the default export function.
- This ensures the character detail page always fetches fresh data from Supabase.

### Step 3: Add tests to verify dynamic exports
- Open `src/__tests__/app.test.tsx`.
- Add test cases that verify the `dynamic` export equals `'force-dynamic'` for both the home page (`src/app/page.tsx`) and the character detail page (`src/app/characters/[id]/page.tsx`).
- This prevents future regressions where someone might accidentally remove the dynamic configuration.
- Example test pattern:
  ```typescript
  it('Home page exports dynamic as force-dynamic', async () => {
    const { dynamic } = await import('../app/page')
    expect(dynamic).toBe('force-dynamic')
  })
  ```

### Step 4: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify the build succeeds with the changes.
- Run `npm test` to verify all tests pass, including the new dynamic export tests.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors (also confirms Next.js recognizes the pages as dynamically rendered — the build output should show these routes as dynamic `λ` rather than static `○`)
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `export const dynamic = 'force-dynamic'` is a Next.js App Router route segment config option. It is the standard, documented approach for opting into dynamic rendering. See: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic
- Only pages that fetch data from Supabase need this change. Static pages like `settings/page.tsx` and `users/page.tsx` do not fetch from the database and should remain statically generated.
- During `npm run build`, the build output will indicate route rendering strategy. After the fix, the home page (`/`) and character detail page (`/characters/[id]`) should show as `λ` (Server/Dynamic) instead of `○` (Static).
