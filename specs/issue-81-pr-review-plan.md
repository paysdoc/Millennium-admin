# PR-Review: Merge origin/develop and resolve conflicts

## PR-Review Description
The PR reviewer (paysdoc) requests merging `origin/develop` into the feature branch `feature/issue-81-decouple-database-scripts-from-application` and resolving the resulting merge conflicts. After fetching origin/develop, `git merge-tree` reveals three conflicts:

1. **`src/__tests__/sync-data.test.ts`** — modify/delete conflict. Deleted in HEAD (our branch renamed it to `src/__tests__/supabase.test.ts`), modified in develop (issue #79 added `isBucketNotFoundError` and `isBucketAlreadyExistsError` tests).
2. **`src/lib/supabase.ts`** — content conflict. Our branch simplified it to a single `getSupabaseClient()`, while develop still has the old staging/production functions (modified in issue #79).
3. **`src/lib/sync-data.ts`** — modify/delete conflict. Deleted in HEAD (moved to `/scripts`), modified in develop (issue #79 bug fixes).

Additionally, develop has non-conflicting changes that must merge cleanly:
- `adws/github/worktreeOperations.ts` — minor log message update in `freeBranchFromMainRepo`.
- `src/lib/schema.ts` — new `isBucketNotFoundError()` and `isBucketAlreadyExistsError()` functions added.
- `specs/issue-79-plan.md` — new plan file (no conflict).

## Summary of Original Implementation Plan
The original plan (`specs/issue-81-plan.md`) implements issue #81 — Decouple database scripts from application. Key changes:
- Simplified `src/lib/supabase.ts` to export only a single environment-agnostic `getSupabaseClient()` using `SUPABASE_URL` and `SUPABASE_KEY`.
- Deleted `src/lib/sync-data.ts` (script-level concern moved to `/scripts`).
- Deleted `src/lib/table-schemas.ts` (only used by deleted sync script).
- Replaced `src/__tests__/sync-data.test.ts` with `src/__tests__/supabase.test.ts` (simplified tests).
- Updated `package.json` `sync:data` script to point to `scripts/sync-supabase.ts`.
- Updated `.env.sample` to remove staging-specific env vars.

## Relevant Files
Use these files to resolve the review:

- `src/lib/supabase.ts` — Content conflict. Our simplified version (single `getSupabaseClient()`) must be kept. Develop's staging/production functions are intentionally removed by issue #81.
- `src/lib/sync-data.ts` — Modify/delete conflict. Deleted in our branch, modified in develop. Must remain deleted per issue #81 (script belongs in `/scripts`).
- `src/__tests__/sync-data.test.ts` — Modify/delete conflict. Deleted in our branch (replaced by `supabase.test.ts`), modified in develop. Must remain deleted.
- `src/__tests__/supabase.test.ts` — Our replacement test file. Must be updated to include tests for the new `isBucketNotFoundError` and `isBucketAlreadyExistsError` functions that were added in develop's `schema.ts`.
- `src/lib/schema.ts` — Non-conflicting change from develop. Two new functions (`isBucketNotFoundError`, `isBucketAlreadyExistsError`) must merge in cleanly.
- `adws/github/worktreeOperations.ts` — Non-conflicting change from develop. Minor log message update; merges cleanly.
- `specs/issue-79-plan.md` — New file from develop. Merges cleanly.
- `guidelines/coding_guidelines.md` — Reference for coding standards.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fetch latest origin/develop
- Run `git fetch origin develop` to ensure we have the latest develop commits.

### Step 2: Merge origin/develop into the feature branch
- Run `git merge origin/develop` from the feature branch.
- This will produce three conflicts:
  - `src/__tests__/sync-data.test.ts` (modify/delete)
  - `src/lib/supabase.ts` (content conflict)
  - `src/lib/sync-data.ts` (modify/delete)
- Non-conflicting files (`adws/github/worktreeOperations.ts`, `src/lib/schema.ts`, `specs/issue-79-plan.md`) will merge automatically.

### Step 3: Resolve `src/lib/supabase.ts` conflict
- The merge will create conflict markers in this file.
- Resolve by keeping our branch's simplified version (single `getSupabaseClient()` using generic `SUPABASE_URL` and `SUPABASE_KEY` env vars).
- Overwrite the conflicted file with our version:
  ```typescript
  import { createClient, SupabaseClient } from '@supabase/supabase-js'

  let client: SupabaseClient | null = null

  export function getSupabaseClient(): SupabaseClient {
    if (client) {
      return client
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)')
    }

    client = createClient(supabaseUrl, supabaseKey)
    return client
  }
  ```
- Run `git add src/lib/supabase.ts` to mark as resolved.

### Step 4: Resolve `src/lib/sync-data.ts` modify/delete conflict
- Develop modified this file, but our branch deliberately deleted it as part of the decoupling (it's superseded by `scripts/sync-supabase.ts`).
- Resolve by keeping it deleted: `git rm src/lib/sync-data.ts`

### Step 5: Resolve `src/__tests__/sync-data.test.ts` modify/delete conflict
- Develop modified this file (added bucket error tests), but our branch deliberately deleted it and replaced it with `src/__tests__/supabase.test.ts`.
- Resolve by keeping it deleted: `git rm src/__tests__/sync-data.test.ts`

### Step 6: Update `src/__tests__/supabase.test.ts` with bucket error tests
- The develop branch added `isBucketNotFoundError` and `isBucketAlreadyExistsError` functions to `src/lib/schema.ts`. These functions now exist in our branch via the auto-merged schema.ts changes.
- The develop branch also had tests for these functions in `src/__tests__/sync-data.test.ts` which we deleted. We need to port those tests into our `src/__tests__/supabase.test.ts`.
- Add the following test describe blocks to `src/__tests__/supabase.test.ts`:
  - Import `isBucketNotFoundError` and `isBucketAlreadyExistsError` from `'../lib/schema'`.
  - Add `isBucketNotFoundError` tests (5 test cases: true for "bucket not found", true for "resource not found", false for permission denied, false for already exists, false for generic error).
  - Add `isBucketAlreadyExistsError` tests (5 test cases: true for "already exists", true for "bucket already exists", false for not found, false for permission denied, false for generic error).
- Run `git add src/__tests__/supabase.test.ts` to stage the updated file.

### Step 7: Complete the merge commit
- Run `git commit` (no `--no-edit`) to finalize the merge with the default merge message.

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the merge is complete with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

Additionally, verify conflict resolution is correct:
- `grep -r "staging" src/ --include="*.ts" --include="*.tsx"` — Should return zero results (confirms decoupling is preserved).
- `grep -r "<<<<<<" src/` — Should return zero results (confirms no unresolved conflict markers).
- `git log --oneline -5` — Should show the merge commit at the top.

## Notes
- The core principle is: our branch's changes (issue #81 decoupling) take priority for the three conflicting files, since the whole purpose of this branch is to remove those staging/production concerns from `/src`.
- The new `isBucketNotFoundError` and `isBucketAlreadyExistsError` functions from develop (issue #79) merge cleanly into `src/lib/schema.ts` — these are still useful for the application's error handling in `characters.ts` and `connections.ts`. We just need to add their corresponding tests to our `supabase.test.ts`.
- The `adws/github/worktreeOperations.ts` change is a minor improvement (adds `git pull` after checkout) and merges cleanly with no impact on our feature.
- After this merge, the branch will be up-to-date with develop and all conflicts resolved, ready for re-review.
