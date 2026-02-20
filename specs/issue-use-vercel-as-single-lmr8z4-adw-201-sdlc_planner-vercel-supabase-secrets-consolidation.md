# Chore: Use Vercel as single source of truth for Supabase credentials

## Metadata
issueNumber: `use-vercel-as-single-lmr8z4`
adwId: `201`
issueJson: `{}`

## Chore Description
Supabase credentials are duplicated across Vercel UI and GitHub Secrets. The `sync-supabase.yml` workflow reads 6 Supabase secrets from GitHub (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`), but the same credentials already exist in Vercel's environment configuration (production and preview). This creates maintenance burden and drift risk when rotating keys.

The sync script (`scripts/sync-supabase.ts`) only uses 4 of these: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`. The `*_KEY` (anon key) secrets are passed to the workflow but never consumed by the sync script.

The solution is to use `vercel env pull` in the sync workflow to fetch credentials from Vercel at runtime, eliminating the 6 Supabase GitHub Secrets. After consolidation, GitHub Secrets only needs: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (already present for the deploy workflow).

## Relevant Files
Use these files to resolve the chore:

- `.github/workflows/sync-supabase.yml` — The sync workflow that currently references 6 Supabase GitHub Secrets. This is the primary file to modify: replace secret references with `vercel env pull` steps.
- `.github/workflows/deploy.yml` — Reference for the existing `vercel env pull` pattern already used in the deploy pipeline. Use this as a template for CLI installation and pull steps.
- `scripts/sync-supabase.ts` — The sync script that consumes the env vars. Confirms only 4 vars are needed: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`. No changes needed to this file.
- `.env.sample` — Contains a CI/CD section with `SUPABASE_KEY_STAGING` comment that is unused by the sync script. Needs cleanup.
- `README.md` — Needs a "Secrets Management" subsection documenting Vercel as the single source of truth for Supabase credentials.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow during implementation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Modify `.github/workflows/sync-supabase.yml`

Replace the 6 Supabase secret references with Vercel CLI-based credential fetching.

- Add `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as workflow-level `env` vars (matching the pattern in `deploy.yml`):
  ```yaml
  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  ```
- Add a new step **"Install Vercel CLI"** after the "Install dependencies" step (matching `deploy.yml` pattern):
  ```yaml
  - name: Install Vercel CLI
    run: npm install --global vercel@latest
  ```
- Add a new step **"Pull Vercel environment variables"** that pulls both production and preview env files:
  ```yaml
  - name: Pull Vercel environment variables
    run: |
      vercel env pull .env.production --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      vercel env pull .env.preview --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
  ```
- Replace the existing **"Run sync script"** step. Remove all 6 `secrets.*` env references. Instead, use a shell script that:
  1. Sources `.env.production` to load production Supabase vars
  2. Captures `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` into temporary variables before they get overwritten
  3. Sources `.env.preview` to load preview/staging Supabase vars
  4. Exports the 4 env vars the sync script expects (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`)
  5. Runs `npm run sync:data`
  ```yaml
  - name: Run sync script
    run: |
      set -euo pipefail
      # Source production env and capture Supabase credentials
      set -a
      source .env.production
      set +a
      PROD_SUPABASE_URL="$SUPABASE_URL"
      PROD_SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY"

      # Source preview env to get staging credentials
      set -a
      source .env.preview
      set +a

      # Export with the names the sync script expects
      export SUPABASE_URL="$PROD_SUPABASE_URL"
      export SUPABASE_SERVICE_KEY="$PROD_SUPABASE_SERVICE_KEY"
      export SUPABASE_URL_STAGING="$SUPABASE_URL"
      export SUPABASE_SERVICE_KEY_STAGING="$SUPABASE_SERVICE_KEY"

      npm run sync:data
  ```

### Step 2: Clean up `.env.sample`

- Remove the `# SUPABASE_KEY_STAGING=` comment line (the anon key is unused by the sync script)
- Update the CI/CD section comment to note that CI pulls credentials from Vercel:
  ```
  # Sync script (scripts/sync-supabase.ts) — CI/CD only
  # In CI, credentials are pulled from Vercel via `vercel env pull`.
  # The staging env vars below are only needed when running the sync script locally.
  # SUPABASE_URL_STAGING=
  # SUPABASE_SERVICE_KEY_STAGING=
  ```

### Step 3: Add "Secrets Management" section to `README.md`

- Add a new `## Secrets Management` subsection after the `## Deployment Pipeline` section (before `## Features`)
- Document:
  - Vercel is the single source of truth for Supabase credentials
  - The deploy workflow (`deploy.yml`) already uses `vercel pull` to fetch env vars
  - The sync workflow (`sync-supabase.yml`) uses `vercel env pull` to fetch Supabase credentials at runtime
  - GitHub Secrets only needs: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  - When rotating Supabase keys, update them only in Vercel Dashboard (both production and preview environments)
  - List the 6 GitHub Secrets that were removed post-consolidation as a note

### Step 4: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to verify no regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `scripts/sync-supabase.ts` file requires NO changes — it already reads from `process.env` which will be populated by the shell sourcing step.
- The `deploy.yml` workflow requires NO changes — it already uses the `vercel pull` pattern.
- After merging this PR, the following GitHub Secrets should be manually removed: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`.
- The `vercel env pull` command writes a standard `.env` file that can be sourced with `set -a; source .env; set +a` to export all variables.
- The shell script in Step 1 uses `set -euo pipefail` for strict error handling: fail on any error, undefined variable, or pipe failure.
