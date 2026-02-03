# Chore: Create environment variables for VERCEL in all environments

## Chore Description
Create a script that uses the Vercel CLI to set the Supabase environment variables (SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY) on each Millennium Admin Vercel environment (development, preview, production). The script should use the VERCEL_CLI_PATH environment variable to locate the Vercel CLI, falling back to the default path if not set. The values for these environment variables should be read from the `.env.local` file.

## Relevant Files
Use these files to resolve the chore:

- `adws/core/config.ts` - Contains configuration constants. Needs to export VERCEL_CLI_PATH similar to existing patterns like CLAUDE_CODE_PATH.
- `adws/core/index.ts` - Core module exports. Needs to export the new VERCEL_CLI_PATH constant.
- `.env.local` - Contains the Supabase environment variable values to be pushed to Vercel environments.
- `.env.sample` - Contains the template for environment variables. Should document VERCEL_CLI_PATH.
- `adws/healthCheck.tsx` - Reference implementation showing how to use execSync and environment variable patterns in ADW scripts.

### New Files
- `adws/vercelEnvSetup.tsx` - New script to push environment variables to Vercel environments using the Vercel CLI.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add VERCEL_CLI_PATH to Configuration
Update `adws/core/config.ts` to add the VERCEL_CLI_PATH constant:

- Add a new export constant: `export const VERCEL_CLI_PATH = process.env.VERCEL_CLI_PATH || 'vercel';`
- This follows the same pattern as CLAUDE_CODE_PATH, using the environment variable if set, otherwise falling back to the command name (which relies on PATH)

### Step 2: Export VERCEL_CLI_PATH from Core Module
Update `adws/core/index.ts` to export the new constant:

- Add `VERCEL_CLI_PATH` to the configuration exports line: `export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR, AGENTS_STATE_DIR, MAX_TEST_RETRY_ATTEMPTS, VERCEL_CLI_PATH } from './config';`

### Step 3: Update .env.sample Documentation
Update `.env.sample` to document the VERCEL_CLI_PATH variable:

- Add `VERCEL_CLI_PATH=` entry in the appropriate section (near other tool paths like CLAUDE_CODE_PATH)
- Add a comment explaining its purpose: path to Vercel CLI executable

### Step 4: Create the Vercel Environment Setup Script
Create `adws/vercelEnvSetup.tsx` with the following functionality:

- Add shebang: `#!/usr/bin/env npx tsx`
- Add documentation header explaining usage: `npx tsx adws/vercelEnvSetup.tsx`
- Import dependencies: `execSync` from `child_process`, `fs` from `fs`, `path` from `path`, `dotenv` from `dotenv`
- Import `VERCEL_CLI_PATH` and `log` from `./core`
- Define the target environments array: `['development', 'preview', 'production']`
- Define the environment variables to set: `['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_KEY']`
- Create a function `loadEnvLocal()` that:
  - Reads and parses `.env.local` file using dotenv
  - Returns an object with the parsed environment variables
  - Throws an error if the file doesn't exist
- Create a function `checkVercelCli()` that:
  - Verifies the Vercel CLI exists at VERCEL_CLI_PATH
  - Runs `vercel --version` to confirm it works
  - Logs the CLI version found
  - Returns true/false for success/failure
- Create a function `checkVercelAuth()` that:
  - Runs `vercel whoami` to check if user is authenticated
  - Returns true/false for authenticated/not authenticated
  - Logs the authentication status
- Create a function `setEnvVariable(name: string, value: string, environment: string)` that:
  - Uses `execSync` to run: `echo "${value}" | ${VERCEL_CLI_PATH} env add ${name} ${environment} --force --yes`
  - The `--force` flag overwrites existing values
  - The `--yes` flag skips confirmation prompts
  - Logs success/failure for each variable
  - Returns true/false for success/failure
- Create a function `listEnvVariables(environment: string)` that:
  - Runs `${VERCEL_CLI_PATH} env ls ${environment}` to verify variables were set
  - Logs the output
- Create the `main()` function that:
  - Logs script start
  - Calls `checkVercelCli()` and exits if CLI not found
  - Calls `checkVercelAuth()` and exits if not authenticated
  - Calls `loadEnvLocal()` to get values
  - Validates that all required variables have values in .env.local
  - For each environment in ['development', 'preview', 'production']:
    - For each variable in ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_KEY']:
      - Call `setEnvVariable()` to push the value
  - After all variables are set, call `listEnvVariables()` for each environment to verify
  - Log summary of results (success count, failure count)
  - Exit with code 0 on success, 1 on any failures

### Step 5: Run Validation Commands
Run all validation commands to ensure the chore is complete with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The Vercel CLI must be installed and authenticated before running the script. Users can authenticate with `vercel login` or by setting the VERCEL_TOKEN environment variable.
- The script uses `--force` to overwrite existing environment variables, making it idempotent and safe to run multiple times.
- The script uses `--yes` to skip interactive confirmation prompts, allowing it to run in automated pipelines.
- SUPABASE_KEY and SUPABASE_SERVICE_KEY contain sensitive credentials. The Vercel CLI handles these securely, and they will be stored encrypted in Vercel's infrastructure.
- After running this script, the environment variables will be available to the deployed application in each Vercel environment. The changes take effect on the next deployment or can be pulled locally with `vercel env pull`.
- The script does NOT run automatically - it's a one-time setup tool that should be run manually when environment variables need to be configured or updated in Vercel.
