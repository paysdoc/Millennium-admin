# Bug: Duplicate `getSupabaseStorageUrl` function causes deployment build failure

## Bug Description
The production build (`npm run build`) fails with a webpack error because the function `getSupabaseStorageUrl` is defined twice in `src/lib/supabase.ts`. The first definition appears at lines 10-25 and an identical duplicate appears at lines 43-58. TypeScript/webpack treats this as a redefinition error, blocking the build and preventing deployment.

**Expected behavior:** `npm run build` completes successfully with no errors.
**Actual behavior:** Build fails with `getSupabaseStorageUrl redefined here` error and exit code 1.

## Problem Statement
The file `src/lib/supabase.ts` contains two identical definitions of the exported function `getSupabaseStorageUrl`. This is a straightforward duplicate code issue — the second definition (lines 43-58) is an exact copy of the first (lines 10-25) and must be removed.

## Solution Statement
Remove the duplicate `getSupabaseStorageUrl` function definition (lines 43-58) from `src/lib/supabase.ts`. The first definition (lines 10-25) is correct and sufficient. No other files need to change since all consumers already import from the same module.

## Steps to Reproduce
1. Clone the repository and check out the current `main` or `bugfix/issue-97-deployment-error` branch.
2. Run `npm install` to install dependencies.
3. Run `npm run build`.
4. Observe the build failure:
   ```
   export function getSupabaseStorageUrl(path: string | null): string | null {
                    ^^^^^^^^^^|^^^^^^^^^^
                              `-- `getSupabaseStorageUrl` redefined here
   > Build failed because of webpack errors
   Error: Command "npm run build" exited with 1
   ```

## Root Cause Analysis
The function `getSupabaseStorageUrl` was accidentally duplicated in `src/lib/supabase.ts`. The file contains:
- **Lines 10-25:** First (correct) definition of `getSupabaseStorageUrl`.
- **Lines 27-41:** Definition of `getSupabaseClient`.
- **Lines 43-58:** Second (duplicate) definition of `getSupabaseStorageUrl` — identical to the first.

This likely occurred during a merge or copy-paste error. The duplicate causes a webpack/TypeScript compilation error because two exported functions with the same name exist in the same module scope.

## Relevant Files
Use these files to fix the bug:

- `src/lib/supabase.ts` — Contains the duplicate function definition. This is the only file that needs modification.
- `src/__tests__/supabase.test.ts` — Contains existing tests for `getSupabaseStorageUrl` that should continue to pass after the fix, confirming no regression.
- `src/lib/characters.ts` — Imports and uses `getSupabaseStorageUrl`; no changes needed but should be verified via build.
- `src/components/CharacterDetails.tsx` — Imports and uses `getSupabaseStorageUrl`; no changes needed but should be verified via build.
- `src/app/characters/[id]/page.tsx` — Imports and uses `getSupabaseStorageUrl`; no changes needed but should be verified via build.

## Step by Step Tasks

### Step 1: Remove the duplicate `getSupabaseStorageUrl` function
- Open `src/lib/supabase.ts`.
- Delete the duplicate function definition at lines 43-58 (the second `getSupabaseStorageUrl` function and its trailing blank line).
- Keep the first definition at lines 10-25 intact — it is correct and complete.
- After removal, the file should contain exactly three exports: `getSupabaseStorageUrl` (lines 10-25), `getSupabaseClient` (lines 27-41), and no duplicates.

### Step 2: Run validation commands
- Run `npm run lint` to verify no linting issues.
- Run `npm run build` to confirm the build succeeds without webpack errors.
- Run `npm test` to confirm all existing tests pass with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- This is a minimal, surgical fix — only the duplicate function definition is removed. No other code changes are required.
- All existing consumers of `getSupabaseStorageUrl` (in `characters.ts`, `CharacterDetails.tsx`, and `characters/[id]/page.tsx`) import from the same module and will work correctly with the single remaining definition.
