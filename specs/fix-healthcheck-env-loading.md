# Bug: healthCheck cannot find GITHUB_PAT from root .env

## Bug Description
The `healthCheck.tsx` script in the `adws/` directory reports that `GITHUB_PAT` is not set, even though it is correctly defined in the root `.env` file. When running `npx tsx adws/healthCheck.tsx <issue_number>`, the health check output shows `GITHUB_PAT set: no` despite the variable being present in `.env`.

Expected behavior: The health check should read `GITHUB_PAT` from the root `.env` file and report `GITHUB_PAT set: yes`.

Actual behavior: The health check reports `GITHUB_PAT set: no` because environment variables from `.env` are not loaded.

## Problem Statement
The `adws/` TypeScript scripts (including `healthCheck.tsx`) run via `npx tsx` and do not automatically load environment variables from the `.env` file. Unlike Next.js which has built-in `.env` loading during `npm run dev/build`, standalone TypeScript scripts executed with `tsx` do not have this behavior. The `config.ts` file reads `process.env.GITHUB_PAT` which is undefined because no `.env` file loading mechanism exists.

## Solution Statement
Add the `dotenv` package to load environment variables from the root `.env` file in the `adws/config.ts` module. Since `config.ts` is imported by all ADW scripts, adding `dotenv` configuration there ensures all scripts will have access to the environment variables. This is a minimal, targeted fix that follows the existing pattern of centralizing configuration in `config.ts`.

## Steps to Reproduce
1. Ensure `GITHUB_PAT` is defined in the root `.env` file
2. Run `npx tsx adws/healthCheck.tsx 1` (or any valid issue number)
3. Observe that the output shows `GITHUB_PAT set: no` under the GitHub CLI section
4. Also observe that the optional environment variables list does not include `GITHUB_PAT`

## Root Cause Analysis
The root cause is the absence of a `.env` file loader in the ADW scripts. The issue chain is:

1. `healthCheck.tsx` imports `GITHUB_PAT` from `./config`
2. `config.ts` reads `process.env.GITHUB_PAT` at module load time
3. `process.env.GITHUB_PAT` is undefined because:
   - The script runs via `npx tsx` which does not auto-load `.env` files
   - No `dotenv` package is installed or configured
   - Environment variables are only available if exported in the shell or set explicitly
4. The health check then correctly reports that `GITHUB_PAT` is not set (because from its perspective, it isn't)

Next.js has built-in `.env` loading, but that only applies during `next dev/build/start`, not for standalone TypeScript scripts.

## Relevant Files
Use these files to fix the bug:

- `adws/config.ts` - The configuration module that reads environment variables. This is where `dotenv` should be initialized since it's imported by all ADW scripts.
- `package.json` - Needs to add `dotenv` as a dependency.

## Step by Step Tasks

### 1. Install dotenv package
- Run `npm install dotenv` to add the dotenv package as a dependency
- This package is the standard solution for loading `.env` files in Node.js applications

### 2. Update config.ts to load environment variables
- Import and configure `dotenv` at the top of `adws/config.ts`
- Use `dotenv.config()` to load the `.env` file from the project root
- Place the dotenv import before any `process.env` access to ensure variables are loaded first

### 3. Verify the fix
- Run `npx tsx adws/healthCheck.tsx <issue_number>` with a valid issue number
- Confirm that `GITHUB_PAT set: yes` appears in the GitHub CLI section
- Confirm that `GITHUB_PAT` appears in the optional environment variables list

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npx tsx adws/healthCheck.tsx 1` - Run health check to verify GITHUB_PAT is now detected (should show "GITHUB_PAT set: yes")
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors

## Notes
- The `dotenv` package is a widely-used, stable solution with no security concerns
- Loading dotenv in `config.ts` ensures all ADW scripts benefit from the fix without needing individual changes
- This fix only affects standalone TypeScript scripts; Next.js already handles `.env` loading for the web application
