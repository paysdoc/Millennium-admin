# PR-Review: Fix Vercel project linking and staging variable assignment in CI workflows

## PR-Review Description
The PR reviewer reports that deployment to Vercel fails when the PR branch triggers CI. The error occurs in the `vercel pull --yes --environment=preview` step of the deploy workflow:

```
Retrieving project…
Error: Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.
```

The root cause is that the Vercel CLI cannot resolve the project from `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` environment variables alone — it requires a `.vercel/project.json` file to link the project. The `.vercel` directory is in `.gitignore` (line 33) so it's never present in CI after checkout.

This affects:
1. **`deploy.yml`** — The existing `vercel pull` step fails, blocking CI for all PRs (including this one).
2. **`sync-supabase.yml`** — The new `vercel env pull` step would face the same linking issue at runtime.

Additionally, there is a **variable assignment bug** in `sync-supabase.yml` lines 50-53: the `export` statements on lines 50-51 overwrite `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` with production values *before* lines 52-53 read them for the staging variables, causing `SUPABASE_URL_STAGING` and `SUPABASE_SERVICE_KEY_STAGING` to incorrectly receive production values instead of preview values.

## Summary of Original Implementation Plan
The original plan (`specs/issue-203-adw-use-vercel-as-single-59sdjo-sdlc_planner-vercel-single-source-supabase.md`) eliminates duplication of Supabase credentials between Vercel UI and GitHub Secrets by:
1. Modifying `sync-supabase.yml` to use `vercel env pull` instead of 6 GitHub Secrets
2. Cleaning up `.env.sample` (removing unused `SUPABASE_KEY_STAGING` comment)
3. Adding "Secrets Management" subsection to `README.md`
4. Running validation commands (lint, build, test)

## Relevant Files
Use these files to resolve the review:

- `.github/workflows/sync-supabase.yml` — Contains the `vercel env pull` step that needs project linking, and the variable assignment bug in the "Run sync script" step (lines 50-53).
- `.github/workflows/deploy.yml` — Contains the `vercel pull` steps that are failing in CI. Needs the same project linking fix applied to all three jobs (`deploy-preview`, `deploy-staging`, `deploy-production`).
- `guidelines/coding_guidelines.md` — Coding guidelines to follow during implementation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add Vercel project linking step to `sync-supabase.yml`

Add a new step after "Install Vercel CLI" and before "Pull Vercel environment variables" that creates the `.vercel/project.json` file from the environment variables already set at the workflow level:

- Insert the following step at line 33 (after the "Install Vercel CLI" step):
  ```yaml
      - name: Link Vercel project
        run: |
          mkdir -p .vercel
          echo '{"orgId":"'"$VERCEL_ORG_ID"'","projectId":"'"$VERCEL_PROJECT_ID"'"}' > .vercel/project.json
  ```

### Step 2: Fix the variable assignment bug in `sync-supabase.yml`

The current "Run sync script" step has a bug where staging variables receive production values. After sourcing `.env.preview`, the preview values of `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` must be captured into separate variables *before* overwriting them with production values.

- Replace the current "Run sync script" step (lines 39-55) with:
  ```yaml
      - name: Run sync script
        run: |
          # Source production env and capture Supabase credentials
          set -a && source .env.production && set +a
          PROD_URL="${SUPABASE_URL}"
          PROD_SERVICE_KEY="${SUPABASE_SERVICE_KEY}"

          # Source preview env and capture preview credentials
          set -a && source .env.preview && set +a
          PREVIEW_URL="${SUPABASE_URL}"
          PREVIEW_SERVICE_KEY="${SUPABASE_SERVICE_KEY}"

          # Export with correct names for sync script
          export SUPABASE_URL="${PROD_URL}"
          export SUPABASE_SERVICE_KEY="${PROD_SERVICE_KEY}"
          export SUPABASE_URL_STAGING="${PREVIEW_URL}"
          export SUPABASE_SERVICE_KEY_STAGING="${PREVIEW_SERVICE_KEY}"

          npm run sync:data
  ```

### Step 3: Add Vercel project linking step to `deploy.yml`

The deploy workflow has the same project linking issue. Add the `.vercel/project.json` creation step to all three jobs, after "Install Vercel CLI" and before "Pull Vercel Environment Information":

- **`deploy-preview` job** (after line 47 "Install Vercel CLI"): Add the linking step before "Pull Vercel Environment Information" (line 49).
- **`deploy-staging` job** (after line 101 "Install Vercel CLI"): Add the linking step before "Pull Vercel Environment Information" (line 104).
- **`deploy-production` job** (after line 133 "Install Vercel CLI"): Add the linking step before "Pull Vercel Environment Information" (line 136).

The step to add in each job:
```yaml
      - name: Link Vercel project
        run: |
          mkdir -p .vercel
          echo '{"orgId":"'"$VERCEL_ORG_ID"'","projectId":"'"$VERCEL_PROJECT_ID"'"}' > .vercel/project.json
```

### Step 4: Run validation commands

- Run `npm run lint` to verify no linting errors.
- Run `npm run build` to verify the application builds successfully.
- Run `npm test` to verify all tests pass with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `.vercel/project.json` approach is the standard fix for Vercel CLI project linking in CI/CD environments. It creates the minimal project configuration that the CLI needs to resolve the project, using the `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` env vars that are already set at the workflow level.
- The variable assignment bug (Step 2) is a logic error from the original implementation: bash evaluates `${SUPABASE_URL}` on lines 52-53 using the values set by the `export` statements on lines 50-51 (production values), not the values from the sourced `.env.preview` file. Capturing preview values into `PREVIEW_URL` and `PREVIEW_SERVICE_KEY` before overwriting fixes this.
- The deploy workflow fix (Step 3) is necessary to unblock CI for this PR, even though `deploy.yml` is not in the original PR scope. Without it, the PR cannot pass CI checks.
