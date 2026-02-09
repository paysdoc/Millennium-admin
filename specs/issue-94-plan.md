# PR-Review: Fix persistent "No characters found" and add backend failure logging

## PR-Review Description
The PR #95 attempted to fix issue #94 by adding `export const dynamic = 'force-dynamic'` to both the home page and character detail page. The reviewer reports two issues:

1. **The problem persists** — "No characters found" is still being shown on staging. The root cause is that `force-dynamic` only changes the page rendering strategy (from static generation to server-side rendering on each request), but does NOT disable the Next.js Data Cache. In Next.js 14, the global `fetch` API is patched to use `force-cache` by default. Since the Supabase JS client v2 uses `fetch` internally, the data fetched from Supabase is cached at the fetch level and never refreshed — even though the page itself re-renders on each request. The fix requires configuring the Supabase client to pass `cache: 'no-store'` to its internal fetch calls.

2. **Missing console warnings** — The reviewer requests logging a warning in the console for every failed call to the backend. Currently, several error paths in `characters.ts` and `connections.ts` throw errors without logging warnings first, and the home page catch block silently captures errors without logging.

## Summary of Original Implementation Plan
The original plan (committed in `5db1358` and implemented in `f49ebe8`) identified that Next.js 14 App Router statically generates server component pages at build time by default. The solution was to add `export const dynamic = 'force-dynamic'` to both `src/app/page.tsx` and `src/app/characters/[id]/page.tsx`, and add tests to verify the exports. The implementation was completed but only addressed page-level static generation — it did not address the fetch-level Data Cache applied to the Supabase client's internal HTTP requests, nor did it add console warnings for failed backend calls.

## Relevant Files
Use these files to resolve the review:

- `src/lib/supabase.ts` — The Supabase client singleton factory. Currently creates the client with default options, meaning the Supabase client's internal `fetch` calls inherit Next.js 14's default `cache: 'force-cache'` behavior. Must be modified to pass a custom `fetch` wrapper with `cache: 'no-store'` to bypass the Next.js Data Cache.
- `src/lib/characters.ts` — Contains `fetchAllCharacters()` and `fetchCharacterById()`. Error paths that throw without logging need `console.warn` added before every throw statement.
- `src/lib/connections.ts` — Contains `fetchAllConnections()` and `fetchConnectionsByCharacter()`. Same issue — error paths that throw without logging need `console.warn` added.
- `src/app/page.tsx` — The home page catch block silently captures errors without logging. Needs `console.warn` added.
- `src/__tests__/app.test.tsx` — Existing test file. Already has dynamic export tests. No changes needed.

### New Files
- `src/__tests__/supabase.test.ts` — If it does not already exist, create a test file to verify the Supabase client is created with `cache: 'no-store'` fetch configuration.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Configure the Supabase client to disable Next.js fetch caching
- Open `src/lib/supabase.ts`.
- Modify the `getSupabaseClient()` function to pass a `global.fetch` option when calling `createClient()`.
- The custom fetch wrapper must forward all arguments to the native `fetch` but override the `cache` option to `'no-store'`, ensuring every HTTP request made by the Supabase client bypasses Next.js 14's Data Cache.
- Implementation:
  ```typescript
  client = createClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
  ```
- Keep the singleton pattern — the `cache: 'no-store'` option applies per-request at the HTTP level, not at the client instance level.

### Step 2: Add console.warn to all error paths in characters.ts
- Open `src/lib/characters.ts`.
- In `fetchAllCharacters()`:
  - Before the `throw new Error(...)` on the Supabase error path (non-table-not-found errors), add: `console.warn('Failed to fetch characters:', error.message)`
  - In the outer catch block, before the re-throw of non-"Failed to fetch" errors, add: `console.warn('Failed to fetch characters:', err instanceof Error ? err.message : 'Unknown error')`
- In `fetchCharacterById()`:
  - Before the `throw new Error(...)` on the Supabase error path, add: `console.warn('Failed to fetch character:', error.message)`
  - In the outer catch block, before the throw, add: `console.warn('Failed to fetch character:', err instanceof Error ? err.message : 'Unknown error')`

### Step 3: Add console.warn to all error paths in connections.ts
- Open `src/lib/connections.ts`.
- In `fetchAllConnections()`:
  - Before the `throw new Error(...)` on the Supabase error path, add: `console.warn('Failed to fetch connections:', error.message)`
  - In the outer catch block, before the throw, add: `console.warn('Failed to fetch connections:', err instanceof Error ? err.message : 'Unknown error')`
- In `fetchConnectionsByCharacter()`:
  - Before the `throw new Error(...)` on the Supabase error path, add: `console.warn('Failed to fetch connections:', error.message)`
  - In the outer catch block, before the throw, add: `console.warn('Failed to fetch connections:', err instanceof Error ? err.message : 'Unknown error')`

### Step 4: Add console.warn to the home page error catch block
- Open `src/app/page.tsx`.
- In the `catch (e)` block inside the `Home` component, add `console.warn('Failed to load characters:', e instanceof Error ? e.message : 'Unknown error')` before the error assignment line.

### Step 5: Add a test to verify the Supabase client uses no-store fetch caching
- Check if `src/__tests__/supabase.test.ts` already exists. If so, add the new test there. If not, create it.
- Add a test that verifies the Supabase client is created with a custom fetch configuration that passes `cache: 'no-store'`.
- Test approach:
  1. Mock `@supabase/supabase-js` `createClient` to capture the options passed.
  2. Call `getSupabaseClient()` with valid env vars.
  3. Extract the custom `fetch` function from the captured options.
  4. Mock the global `fetch` and call the custom fetch wrapper.
  5. Assert that the global `fetch` was called with `cache: 'no-store'` in the init options.

### Step 6: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify the build succeeds. Confirm that `/` and `/characters/[id]` still show as `λ` (dynamic) in the build output.
- Run `npm test` to verify all tests pass with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- IMPORTANT: Strictly adhere to the coding guidelines in `/guidelines`.
- The root cause is a two-layer caching problem in Next.js 14:
  1. **Page-level caching** (static generation) — addressed by `export const dynamic = 'force-dynamic'` (already in place from original fix).
  2. **Fetch-level caching** (Data Cache) — addressed by passing `cache: 'no-store'` to the Supabase client's fetch wrapper (this plan's fix).
- The `console.warn` additions follow the existing pattern in the codebase (e.g., table-not-found warnings already use `console.warn`). Each warning includes the function context and error message for debuggability.
- The `getSupabaseStorageUrl()` function in `src/lib/supabase.ts` does not make fetch calls — it only constructs URLs. It does not need modification.
- Only the Supabase client needs the `cache: 'no-store'` fix since it's the only external data source. The settings and users pages don't fetch from Supabase and are unaffected.
