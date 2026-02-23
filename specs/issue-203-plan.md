# PR-Review: Add diagnostic logging for Supabase credential debugging in sync workflow

## PR-Review Description
The PR reviewer reports two issues with the Vercel-as-single-source implementation:

1. **Vercel project linking failure** — The `vercel pull` step in CI fails with `"Could not retrieve Project Settings. To link your Project, remove the .vercel directory and deploy again."` This was caused by the missing `.vercel/project.json` file in CI environments. **Already fixed** in commit `5309a84` by adding a "Link Vercel project" step that creates `.vercel/project.json` from the `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` env vars in both `deploy.yml` and `sync-supabase.yml`.

2. **Incorrect API key** — After the linking fix, the sync script runs but all table syncs and bucket syncs fail with `"Invalid API key"`. The reviewer requests diagnostic logging: log the last 4 characters of each Supabase credential (or `"null"` if empty) when syncing tables and buckets. This will reveal whether the env vars pulled from Vercel are correct, empty, or misnamed.

The root cause of the "Invalid API key" error is unknown — it could be that `vercel env pull` outputs variable names that don't match what the sync script expects (e.g., `NEXT_PUBLIC_SUPABASE_URL` vs `SUPABASE_URL`), that values are empty, or that there's a formatting issue in the pulled `.env` file. The diagnostic logging will identify the exact problem.

## Summary of Original Implementation Plan
The original plan (`specs/issue-203-adw-use-vercel-as-single-59sdjo-sdlc_planner-vercel-single-source-supabase.md`) eliminates duplication of Supabase credentials between Vercel UI and GitHub Secrets by:
1. Modifying `sync-supabase.yml` to use `vercel env pull` instead of 6 GitHub Secrets
2. Adding a "Link Vercel project" step to create `.vercel/project.json` in CI
3. Sourcing the pulled `.env` files and exporting the 4 required env vars for the sync script
4. Cleaning up `.env.sample` (removing unused `SUPABASE_KEY_STAGING` comment)
5. Adding "Secrets Management" subsection to `README.md`

## Relevant Files
Use these files to resolve the review:

- `.github/workflows/sync-supabase.yml` — The sync workflow. The "Run sync script" step needs diagnostic `echo` statements after exporting env vars and before running `npm run sync:data`, to log the last 4 chars of each credential to the CI log.
- `scripts/sync-supabase.ts` — The sync script. The `getEnvironment()` function (lines 151-175) validates and returns the 4 env vars. Needs diagnostic logging of the last 4 chars of each env var after validation, so the Node.js process confirms what values it actually received.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow during implementation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add diagnostic logging to `.github/workflows/sync-supabase.yml`

In the "Run sync script" step, add `echo` statements **after** the `export` lines and **before** `npm run sync:data` to log the last 4 characters of each credential (or `"null"` if the variable is empty).

- Insert the following lines between the last `export` statement and `npm run sync:data` in the "Run sync script" step (after line 60, before line 62):
  ```bash
  # Log last 4 chars of each credential for debugging ("null" if empty)
  echo "SUPABASE_URL tail: $([ -n "$SUPABASE_URL" ] && printf '%s' "${SUPABASE_URL: -4}" || printf 'null')"
  echo "SUPABASE_SERVICE_KEY tail: $([ -n "$SUPABASE_SERVICE_KEY" ] && printf '%s' "${SUPABASE_SERVICE_KEY: -4}" || printf 'null')"
  echo "SUPABASE_URL_STAGING tail: $([ -n "$SUPABASE_URL_STAGING" ] && printf '%s' "${SUPABASE_URL_STAGING: -4}" || printf 'null')"
  echo "SUPABASE_SERVICE_KEY_STAGING tail: $([ -n "$SUPABASE_SERVICE_KEY_STAGING" ] && printf '%s' "${SUPABASE_SERVICE_KEY_STAGING: -4}" || printf 'null')"
  ```

### Step 2: Add diagnostic logging to `scripts/sync-supabase.ts`

Add a `maskSecret` helper and credential logging inside the `getEnvironment()` function, right after the missing-variable validation check and before the `return` statement. This confirms what the Node.js process actually received from the shell environment.

- Add the following `maskSecret` helper function before the `getEnvironment` function (before line 151):
  ```typescript
  /**
   * Returns the last 4 characters of a secret for safe CI log output.
   * Returns "null" when the value is undefined or empty.
   */
  const maskSecret = (value: string | undefined): string =>
    value ? `...${value.slice(-4)}` : 'null'
  ```

- Add the following logging lines inside `getEnvironment()`, after the validation check (after line 167, before the `return` on line 169):
  ```typescript
  console.log('Credential check (last 4 chars):')
  console.log(`  SUPABASE_URL: ${maskSecret(productionUrl)}`)
  console.log(`  SUPABASE_SERVICE_KEY: ${maskSecret(productionKey)}`)
  console.log(`  SUPABASE_URL_STAGING: ${maskSecret(stagingUrl)}`)
  console.log(`  SUPABASE_SERVICE_KEY_STAGING: ${maskSecret(stagingKey)}`)
  ```

### Step 3: Run validation commands

- Run `npm run lint` to verify no linting errors.
- Run `npm run build` to verify the application builds successfully.
- Run `npm test` to verify all tests pass with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The Vercel project linking issue (review comment 1) was already resolved in commit `5309a84`. No further changes needed for that issue.
- The diagnostic logging only exposes the last 4 characters of each credential. This is safe for CI logs — it reveals enough to verify correctness without exposing the full secret.
- The `maskSecret` helper is used 4 times in `getEnvironment()`, making a small function preferable to repeating the ternary inline.
- Once the workflow is re-run and the logs are inspected, the root cause of "Invalid API key" should be immediately apparent: either the values are `"null"` (meaning the env var names in Vercel don't match), or the last 4 chars don't match the expected keys (meaning the wrong values are configured in Vercel).
- If the env var names in Vercel turn out to be different (e.g., `NEXT_PUBLIC_SUPABASE_URL`), a follow-up change will be needed to either rename the Vercel env vars or add mapping logic in the workflow.
