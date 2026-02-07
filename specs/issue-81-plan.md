# Feature: Decouple Database Scripts from Application

## Feature Description
Remove all environment-specific (staging/production) database references from the `/src` directory so the application is entirely environment-agnostic. The application should connect to a single Supabase instance determined solely by environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`) — it should never know which environment it is running in. The `/scripts` directory, which is used by CI/CD pipelines and must be environment-aware, retains its staging/production distinction. There must be zero cross-contamination between `/src` and `/scripts`.

## User Story
As a developer
I want the application source code to be completely environment-agnostic
So that deployment environments are determined by infrastructure configuration, not by application code

## Problem Statement
The `/src` directory contains explicit references to a staging Supabase environment (`getStagingSupabaseClient`, `getStagingServiceClient`, `SUPABASE_URL_STAGING`, etc.). This violates the principle that the application should not be aware of different environments. The environment itself — via its environment variables — should determine which database the application connects to. Additionally, `src/lib/sync-data.ts` is a script-level concern (production-to-staging data sync) that does not belong in the application source.

## Solution Statement
1. **Simplify `src/lib/supabase.ts`** — Replace all environment-specific client factories with a single `getSupabaseClient()` that reads generic `SUPABASE_URL` and `SUPABASE_KEY` environment variables. Remove all staging/production-specific functions and cached client variables.
2. **Remove `src/lib/sync-data.ts`** — This file is a data sync script that belongs in `/scripts`, not in the application. It is already superseded by the more robust `/scripts/sync-supabase.ts`. Delete it.
3. **Remove `src/lib/table-schemas.ts`** — This file provides CREATE TABLE SQL only used by `sync-data.ts`. Since `sync-data.ts` is being removed and the scripts directory has its own schema management, this file is no longer needed in `/src`.
4. **Update tests** — Rewrite `src/__tests__/sync-data.test.ts` to test only the simplified `getSupabaseClient()` function and remove all staging/production-specific test cases.
5. **Update `package.json`** — Change the `sync:data` script to point to `scripts/sync-supabase.ts` instead of `src/lib/sync-data.ts`.
6. **Update `.env.sample`** — Remove staging-specific environment variable entries and clarify that `SUPABASE_URL` and `SUPABASE_KEY` point to whatever environment the app is deployed to.

## Relevant Files
Use these files to implement the feature:

- `src/lib/supabase.ts` — Core file to simplify. Remove all staging/production-specific functions, keep only a single environment-agnostic `getSupabaseClient()`.
- `src/lib/sync-data.ts` — To be deleted. This is a sync script that belongs in `/scripts`, not `/src`. Already superseded by `scripts/sync-supabase.ts`.
- `src/lib/table-schemas.ts` — To be deleted. Only used by `sync-data.ts` which is being removed.
- `src/lib/characters.ts` — Uses `getSupabaseClient()` (no changes needed, already uses the generic function).
- `src/lib/connections.ts` — Uses `getSupabaseClient()` (no changes needed, already uses the generic function).
- `src/lib/schema.ts` — Utility for error handling (no changes needed).
- `src/__tests__/sync-data.test.ts` — Must be rewritten to remove staging/production-specific tests and test only the simplified `getSupabaseClient()`.
- `package.json` — Update `sync:data` script path from `src/lib/sync-data.ts` to `scripts/sync-supabase.ts`.
- `.env.sample` — Remove staging-specific env vars, clarify that `SUPABASE_URL`/`SUPABASE_KEY` are environment-agnostic.
- `scripts/sync-supabase.ts` — Already correctly environment-aware. No changes needed; just verify it has no imports from `/src`.
- `guidelines/coding_guidelines.md` — Reference for coding standards.

### New Files
- No new files are needed. This feature simplifies the codebase by removing files and code.

## Implementation Plan
### Phase 1: Foundation
- Audit all imports and usages of staging/production-specific functions throughout `/src` to confirm the blast radius.
- Confirm `src/lib/characters.ts` and `src/lib/connections.ts` only use `getSupabaseClient()` (the generic function) — they do.
- Confirm `scripts/sync-supabase.ts` has zero imports from `/src` — it does not.
- Confirm `sync:data` npm script currently points to `src/lib/sync-data.ts`.

### Phase 2: Core Implementation
- Simplify `src/lib/supabase.ts` to export only `getSupabaseClient()` using generic env vars (`SUPABASE_URL`, `SUPABASE_KEY`).
- Delete `src/lib/sync-data.ts` (environment-aware sync script that belongs in `/scripts`).
- Delete `src/lib/table-schemas.ts` (only used by the deleted sync script).
- Rewrite `src/__tests__/sync-data.test.ts` (rename to `src/__tests__/supabase.test.ts`) to test only the simplified client factory.
- Update `package.json` to point `sync:data` to `scripts/sync-supabase.ts`.
- Update `.env.sample` to remove staging-specific variables.

### Phase 3: Integration
- Run linter, build, and tests to validate zero regressions.
- Verify the application still functions correctly with the simplified Supabase client.
- Verify `scripts/sync-supabase.ts` still works independently (it has no `/src` dependencies).

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Simplify `src/lib/supabase.ts`
- Replace the entire file with a single environment-agnostic `getSupabaseClient()` function.
- The function should read `SUPABASE_URL` and `SUPABASE_KEY` from `process.env`.
- Use a cached singleton pattern (same as current implementation).
- Throw a clear error if env vars are missing: `'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)'`.
- Remove all exports: `getStagingSupabaseClient`, `getProductionSupabaseClient`, `getStagingServiceClient`, `getProductionServiceClient`.
- Keep only the single export: `getSupabaseClient`.

### Step 2: Delete `src/lib/sync-data.ts`
- Remove this file entirely. It is a production-to-staging sync script that:
  - References staging-specific environment variables and client factories.
  - Is already superseded by the more feature-complete `scripts/sync-supabase.ts`.
  - Does not belong in application source code.

### Step 3: Delete `src/lib/table-schemas.ts`
- Remove this file entirely. It provides CREATE TABLE SQL statements only used by `sync-data.ts`.
- The `/scripts` directory manages its own schema concerns.

### Step 4: Rewrite tests — rename `src/__tests__/sync-data.test.ts` to `src/__tests__/supabase.test.ts`
- Delete the old `src/__tests__/sync-data.test.ts` file.
- Create `src/__tests__/supabase.test.ts` with tests for:
  - `isTableNotFoundError` (keep existing tests, they are still valid).
  - `getSupabaseClient` — test that it throws when `SUPABASE_URL` is missing.
  - `getSupabaseClient` — test that it throws when `SUPABASE_KEY` is missing.
- Remove all staging/production-specific test describe blocks (`getStagingSupabaseClient`, `getStagingServiceClient`, `getProductionSupabaseClient`, `getProductionServiceClient`).

### Step 5: Update `package.json` `sync:data` script
- Change `"sync:data": "tsx src/lib/sync-data.ts"` to `"sync:data": "tsx scripts/sync-supabase.ts"`.

### Step 6: Update `.env.sample`
- Remove `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, and `SUPABASE_SERVICE_KEY_STAGING` entries and their comments.
- Update the comment for `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_KEY` to clarify they are environment-agnostic (the deployment environment determines which database these point to).
- Add a new comment section for the sync script indicating that staging env vars are only needed when running `scripts/sync-supabase.ts` directly and should be set in CI/CD secrets, not in `.env`.

### Step 7: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate zero regressions.

## Testing Strategy
### Unit Tests
- Test `getSupabaseClient()` throws when `SUPABASE_URL` is missing.
- Test `getSupabaseClient()` throws when `SUPABASE_KEY` is missing.
- Test `isTableNotFoundError` continues to work correctly (retain existing tests).

### Integration Tests
- `npm run build` confirms the application compiles without errors.
- `npm run lint` confirms no broken imports or unused references.

### Edge Cases
- Application must work when only `SUPABASE_URL` and `SUPABASE_KEY` are set (no staging vars).
- `scripts/sync-supabase.ts` must continue to work independently with its own staging env vars.
- No component or library in `/src` should import from `/scripts`.
- No file in `/scripts` should import from `/src`.

## Acceptance Criteria
- `src/lib/supabase.ts` exports only `getSupabaseClient()` using generic `SUPABASE_URL` and `SUPABASE_KEY` env vars.
- No file in `/src` references "staging", "production", `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, or `SUPABASE_SERVICE_KEY_STAGING`.
- `src/lib/sync-data.ts` is deleted.
- `src/lib/table-schemas.ts` is deleted.
- `src/__tests__/supabase.test.ts` tests the simplified client factory.
- `package.json` `sync:data` script points to `scripts/sync-supabase.ts`.
- `.env.sample` no longer lists staging-specific env vars as application requirements.
- `npm run lint` passes with zero errors.
- `npm run build` succeeds.
- `npm test` passes with zero failures.
- No cross-contamination: no imports between `/src` and `/scripts`.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

Additionally, run the following grep validations to confirm decoupling:

- `grep -r "staging" src/ --include="*.ts" --include="*.tsx"` — Should return zero results.
- `grep -r "SUPABASE_URL_STAGING\|SUPABASE_KEY_STAGING\|SUPABASE_SERVICE_KEY_STAGING" src/` — Should return zero results.
- `grep -r "getStagingSupabaseClient\|getStagingServiceClient\|getProductionSupabaseClient\|getProductionServiceClient" src/` — Should return zero results.
- `grep -r "from.*src/" scripts/` — Should return zero results (no cross-contamination).
- `grep -r "from.*scripts/" src/` — Should return zero results (no cross-contamination).

## Notes
- IMPORTANT: Strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `scripts/sync-supabase.ts` file is intentionally environment-aware and must NOT be changed. It correctly manages staging/production separation for CI/CD operations.
- `src/lib/characters.ts` and `src/lib/connections.ts` already use the generic `getSupabaseClient()` — no changes needed.
- The `src/lib/schema.ts` utility (`isTableNotFoundError`) is still used by `characters.ts` and `connections.ts` for graceful error handling — it stays.
- After this change, the application connects to whichever Supabase instance is configured in `SUPABASE_URL` and `SUPABASE_KEY`. In local dev this will be the staging URL. In production deployment, Vercel will set these to the production URL. The app never needs to know the difference.
