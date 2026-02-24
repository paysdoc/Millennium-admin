# Chore: Use Vercel as single source of truth for Supabase credentials

## Metadata
issueNumber: `203`
adwId: `use-vercel-as-single-59sdjo`
issueJson: `{"number":203,"title":"Use Vercel as single source of truth for Supabase credentials","body":"## Problem\n\nSupabase credentials are duplicated across Vercel UI and GitHub Secrets. The `sync-supabase.yml` workflow reads 6 Supabase secrets from GitHub, but the same credentials already exist in Vercel's environment configuration (production and preview). This creates maintenance burden and drift risk when rotating keys.\n\n## Current State\n\n| Secret | Vercel UI | GitHub Secrets | Needed By |\n|--------|-----------|----------------|-----------|\n| `SUPABASE_URL` | Production env | `sync-supabase.yml` | App + sync script |\n| `SUPABASE_KEY` | Production env | `sync-supabase.yml` | App only (unused by sync) |\n| `SUPABASE_SERVICE_KEY` | Production env | `sync-supabase.yml` | App + sync script |\n| `SUPABASE_URL` (preview) | Preview env | As `*_STAGING` | Sync script |\n| `SUPABASE_KEY` (preview) | Preview env | As `*_STAGING` | Unused by sync |\n| `SUPABASE_SERVICE_KEY` (preview) | Preview env | As `*_STAGING` | Sync script |\n\nThe sync script (`scripts/sync-supabase.ts`) only reads 4 vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`. The `*_KEY` (anon key) secrets are passed but never used.\n\n## Proposed Solution\n\nUse `vercel env pull` in the sync workflow to fetch credentials from Vercel at runtime, eliminating the 6 Supabase GitHub Secrets.\n\n**After consolidation, GitHub Secrets only needs:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (already there for deploys).\n\n### Manual Steps (post-merge)\n\nRemove these GitHub Secrets:\n- `SUPABASE_URL`\n- `SUPABASE_KEY`\n- `SUPABASE_SERVICE_KEY`\n- `SUPABASE_URL_STAGING`\n- `SUPABASE_KEY_STAGING`\n- `SUPABASE_SERVICE_KEY_STAGING`","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-02-23T12:16:05Z"}`

## Chore Description
Supabase credentials are duplicated across Vercel UI and GitHub Secrets. The `sync-supabase.yml` workflow reads 6 Supabase secrets from GitHub, but the same credentials already exist in Vercel's environment configuration (production and preview). This creates maintenance burden and drift risk when rotating keys.

The sync script (`scripts/sync-supabase.ts`) only uses 4 of the 6 secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`. The `*_KEY` (anon key) secrets are passed to the workflow but never consumed by the script.

The solution is to use `vercel env pull` in the sync workflow to fetch credentials from Vercel at runtime, consolidating Vercel as the single source of truth and eliminating the 6 redundant Supabase GitHub Secrets.

## Relevant Files
Use these files to resolve the chore:

- `.github/workflows/sync-supabase.yml` — The sync workflow that currently references 6 Supabase GitHub Secrets. This is the primary file to modify: replace secret references with `vercel env pull` steps.
- `.github/workflows/deploy.yml` — Reference for how the deploy workflow already uses Vercel CLI (`vercel pull`, `vercel build`, `vercel deploy`) with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Use as a pattern for the sync workflow changes.
- `.env.sample` — Contains CI/CD section with `SUPABASE_KEY_STAGING` comment that is unused by the sync script. Needs cleanup.
- `README.md` — Needs a new "Secrets Management" subsection documenting Vercel as the single source of truth.
- `scripts/sync-supabase.ts` — The sync script that consumes the environment variables. No code changes needed, but important for understanding which env vars are required (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`).
- `guidelines/coding_guidelines.md` — Coding guidelines to follow during implementation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Modify `.github/workflows/sync-supabase.yml`

Replace the 6 Supabase secret references with Vercel CLI-based credential fetching. Follow the pattern already established in `.github/workflows/deploy.yml`.

- Add top-level `env` block for `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (required by `vercel env pull`):
  ```yaml
  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  ```

- Add a new step after "Install dependencies" to install Vercel CLI (matching the pattern in `deploy.yml`):
  ```yaml
  - name: Install Vercel CLI
    run: npm install --global vercel@latest
  ```

- Add a new step to pull environment variables from Vercel for both production and preview:
  ```yaml
  - name: Pull Vercel environment variables
    run: |
      vercel env pull .env.production --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      vercel env pull .env.preview --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
  ```

- Replace the existing "Run sync script" step. Remove all 6 `secrets.*` env references. Instead, source the pulled `.env` files and export the 4 variables the sync script needs:
  ```yaml
  - name: Run sync script
    run: |
      # Source production env and capture Supabase credentials
      set -a && source .env.production && set +a
      PROD_URL="${SUPABASE_URL}"
      PROD_SERVICE_KEY="${SUPABASE_SERVICE_KEY}"

      # Source preview env (overwrites same-named vars with staging values)
      set -a && source .env.preview && set +a

      # Export with correct names for sync script:
      # - Production credentials restored from captured values
      # - Preview credentials mapped to *_STAGING names
      export SUPABASE_URL="${PROD_URL}"
      export SUPABASE_SERVICE_KEY="${PROD_SERVICE_KEY}"
      export SUPABASE_URL_STAGING="${SUPABASE_URL}"
      export SUPABASE_SERVICE_KEY_STAGING="${SUPABASE_SERVICE_KEY}"

      npm run sync:data
  ```

- The complete updated workflow should look like:
  ```yaml
  name: Sync Supabase Data

  on:
    schedule:
      - cron: '0 0 1 * *'
    workflow_dispatch:

  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

  jobs:
    sync:
      name: Sync Production to Staging
      runs-on: ubuntu-latest
      steps:
        - name: Checkout code
          uses: actions/checkout@v4

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'

        - name: Install dependencies
          run: npm ci

        - name: Install Vercel CLI
          run: npm install --global vercel@latest

        - name: Pull Vercel environment variables
          run: |
            vercel env pull .env.production --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
            vercel env pull .env.preview --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}

        - name: Run sync script
          run: |
            # Source production env and capture Supabase credentials
            set -a && source .env.production && set +a
            PROD_URL="${SUPABASE_URL}"
            PROD_SERVICE_KEY="${SUPABASE_SERVICE_KEY}"

            # Source preview env (overwrites same-named vars with staging values)
            set -a && source .env.preview && set +a

            # Export with correct names for sync script
            export SUPABASE_URL="${PROD_URL}"
            export SUPABASE_SERVICE_KEY="${PROD_SERVICE_KEY}"
            export SUPABASE_URL_STAGING="${SUPABASE_URL}"
            export SUPABASE_SERVICE_KEY_STAGING="${SUPABASE_SERVICE_KEY}"

            npm run sync:data

        - name: Create issue on failure
          if: failure()
          uses: actions/github-script@v7
          with:
            github-token: ${{ secrets.GITHUB_TOKEN }}
            script: |
              const title = `Supabase sync failed on ${new Date().toISOString().split('T')[0]}`;
              const body = `The scheduled Supabase data sync from production to staging has failed.

              **Workflow Run:** [View Details](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})

              Please investigate the logs and re-run manually if needed.`;

              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: title,
                body: body,
                labels: ['bug', 'sync']
              });
  ```

### Step 2: Clean up `.env.sample`

- Remove the `# SUPABASE_KEY_STAGING=` line — this variable is unused by the sync script and will no longer exist as a GitHub Secret.
- Update the CI/CD comment block to note that CI pulls credentials from Vercel at runtime.
- The updated section should read:
  ```env
  # Sync script (scripts/sync-supabase.ts) — CI/CD only
  # CI pulls Supabase credentials from Vercel at runtime via `vercel env pull`.
  # The staging env vars below are only needed when running the sync script locally.
  # SUPABASE_URL_STAGING=
  # SUPABASE_SERVICE_KEY_STAGING=
  ```

### Step 3: Add "Secrets Management" subsection to `README.md`

- Add a new `### Secrets Management` subsection inside the existing `## Deployment Pipeline` section, after the `### Troubleshooting` subsection.
- Document that Vercel is the single source of truth for Supabase credentials:
  ```markdown
  ### Secrets Management

  Vercel is the single source of truth for Supabase credentials. Environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`) are configured in the Vercel Dashboard for both Production and Preview environments.

  **GitHub Secrets** only stores Vercel access credentials:
  - `VERCEL_TOKEN` — API token for Vercel CLI
  - `VERCEL_ORG_ID` — Vercel organization ID
  - `VERCEL_PROJECT_ID` — Vercel project ID

  Both the deploy workflow and the sync workflow use `vercel env pull` to fetch environment variables at runtime, eliminating credential duplication.
  ```

### Step 4: Run validation commands

- Run `npm run lint` to verify no linting errors.
- Run `npm run build` to verify the application builds successfully.
- Run `npm test` to verify all tests pass with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The sync script (`scripts/sync-supabase.ts`) requires no code changes — it already reads from `process.env` and the 4 required variable names remain the same.
- The `vercel env pull` command outputs a standard `.env` file. Using `set -a && source <file> && set +a` exports all variables from the file into the current shell session.
- Production credentials must be captured before sourcing the preview `.env` file, because both files contain variables with the same names (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`). Sourcing the preview file overwrites the production values.
- Post-merge manual step: remove the 6 Supabase GitHub Secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`). This is documented in the issue and should be done after verifying the workflow runs successfully.
