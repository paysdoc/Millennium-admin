# PR-Review: Fix Supabase CLI installation in deploy workflow

## PR-Review Description

PR #208 implements a `category_name` table for issue #207. A previous review cycle already migrated from Knex.js to Supabase CLI migrations and added `supabase db push` steps to `deploy.yml`. However, the deploy workflow still fails because the Supabase CLI installation step uses `npm install -g supabase@latest`, which is not supported — the Supabase CLI explicitly blocks global npm installation and exits with an error:

```
npm error Installing Supabase CLI as a global module is not supported.
npm error Please use one of the supported package managers: https://github.com/supabase/cli#install-the-cli
```

The fix is to replace `npm install -g supabase@latest` with the official `supabase/setup-cli@v1` GitHub Action in all three deploy jobs (`deploy-preview`, `deploy-staging`, `deploy-production`).

## Summary of Original Implementation Plan

The original plan (`specs/issue-207-adw-set-up-category-name-bvy2fq-sdlc_planner-add-category-name-table.md`) specified a three-phase approach: (1) install Knex.js and configure migrations, (2) create the `category_name` table migration/seed and data access layer, (3) integrate into UI components and the Vercel deployment pipeline. A subsequent review cycle migrated from Knex to Supabase CLI migrations (`supabase/migrations/20260224200000_create_category_name.sql`), removed all Knex infrastructure, and added `supabase db push` steps to `deploy.yml`. The remaining issue is that the Supabase CLI installation method in the deploy workflow is broken.

## Relevant Files
Use these files to resolve the review:

- **`.github/workflows/deploy.yml`** — The deploy workflow. Contains three jobs (`deploy-preview`, `deploy-staging`, `deploy-production`), each with an "Install Supabase CLI" step that uses the broken `npm install -g supabase@latest` command. This is the only file that needs code changes.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Replace Supabase CLI installation in `deploy-preview` job

- In `.github/workflows/deploy.yml`, in the `deploy-preview` job, replace the "Install Supabase CLI" step:
  ```yaml
  # BEFORE (broken):
  - name: Install Supabase CLI
    run: npm install -g supabase@latest

  # AFTER (fixed):
  - name: Install Supabase CLI
    uses: supabase/setup-cli@v1
    with:
      version: latest
  ```
- The `supabase/setup-cli@v1` action is the official GitHub Action for installing the Supabase CLI on GitHub-hosted runners (ubuntu-latest). It downloads the correct binary directly without npm.

### 2. Replace Supabase CLI installation in `deploy-staging` job

- Apply the same change to the `deploy-staging` job:
  ```yaml
  - name: Install Supabase CLI
    uses: supabase/setup-cli@v1
    with:
      version: latest
  ```

### 3. Replace Supabase CLI installation in `deploy-production` job

- Apply the same change to the `deploy-production` job:
  ```yaml
  - name: Install Supabase CLI
    uses: supabase/setup-cli@v1
    with:
      version: latest
  ```

### 4. Run validation commands

- Run all validation commands to confirm zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes

- The `supabase/setup-cli@v1` action is the officially recommended way to install the Supabase CLI in GitHub Actions (see [supabase/setup-cli](https://github.com/supabase/setup-cli)). It supports `ubuntu-latest`, `windows-latest`, and `macos-latest` runners.
- The `version: latest` input ensures the most recent CLI version is always used, matching the intent of the original `npm install -g supabase@latest` command.
- The `Push Supabase Migrations` steps that follow (using `npx supabase db push`) remain unchanged — they will now work because the CLI is properly installed on the runner's PATH by the setup action.
- No application code changes are needed — this is purely a CI/CD pipeline fix.
