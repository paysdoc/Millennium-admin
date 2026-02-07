# Chore: Rewrite Test Commands

## Chore Description
Rewrite the `/test` and `/test_e2e` commands to be suitable to the code architecture. The current commands reference Python backend tests (uv, pytest, ruff) and assume a `app/client` and `app/server` directory structure that does not exist in this project.

This is a Next.js + TypeScript project with:
- Application code in `src/app/` (Next.js App Router)
- ADW (AI Developer Workflow) scripts in `adws/`
- Tests using vitest, currently located in `adws/__tests__/`

The commands must:
1. Remove all Python references
2. Remove the irrelevant backend/frontend distinction
3. Make a clear distinction between ADW tests (tests for the workflow scripts) and application tests (tests for the Next.js app)
4. Adapt E2E testing for Next.js application structure

## Relevant Files
Use these files to resolve the chore:

- `.claude/commands/test.md` - The main test command that needs to be rewritten. Currently references Python, `app/client`, `app/server` which don't exist.
- `.claude/commands/test_e2e.md` - The E2E test command that needs to be rewritten. References backend scripts and server/client startup that don't apply.
- `package.json` - Contains the actual test scripts (`npm test` runs `vitest run`). Needed to understand how tests are executed.
- `adws/__tests__/*.test.ts` - Current ADW test files using vitest. These are the actual tests that exist in the project.
- `adws/tsconfig.json` - TypeScript configuration for ADW scripts.

### New Files
None required. This chore modifies existing command files only.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Rewrite the `/test` command

Rewrite `.claude/commands/test.md` with the following changes:

- Remove all Python-related tests:
  - Remove "Python Syntax Check" test (uses `uv run python -m py_compile`)
  - Remove "Backend Code Quality Check" test (uses `uv run ruff check`)
  - Remove "All Backend Tests" test (uses `uv run pytest`)

- Remove references to `app/client` and `app/server` directories

- Add new test structure with two categories:
  1. **ADW Tests** - Tests for the AI Developer Workflow scripts in `adws/__tests__/`
  2. **Application Tests** - Tests for the Next.js application in `src/`

- Update the Test Execution Sequence to include:
  1. **Linting** - `npm run lint` (validates code quality for both application and ADW code)
  2. **TypeScript Type Check** - `npx tsc --noEmit` (validates TypeScript types for application)
  3. **ADW TypeScript Check** - `npx tsc --noEmit -p adws/tsconfig.json` (validates ADW TypeScript types)
  4. **ADW Tests** - `npm test -- --run adws/__tests__` (runs ADW unit tests with vitest)
  5. **Application Tests** - `npm test -- --run src/` (runs application tests with vitest - will pass if none exist)
  6. **Build** - `npm run build` (validates the complete Next.js build process)

- Keep the same JSON output format for consistency with existing tooling

### Step 2: Rewrite the `/test_e2e` command

Rewrite `.claude/commands/test_e2e.md` with the following changes:

- Remove references to:
  - `scripts/reset_db.sh` (doesn't exist)
  - Backend server startup scripts
  - Python-specific configuration

- Update the Setup section to:
  1. Ensure the Next.js dev server is running (`npm run dev` or verify port 3000)
  2. No database reset needed (application uses external APIs)

- Update variables:
  - Change `application_url` default from `http://localhost:5173` to `http://localhost:3000` (Next.js default port)

- Update Screenshot Directory structure:
  - Change from `<absolute path to codebase>/agents/<adw_id>/<agent_name>/img/` to a simpler path since this project doesn't have the same agent directory structure
  - Use `<absolute path to codebase>/e2e-screenshots/<test name>/` as the screenshot directory

- Keep the Playwright MCP Server approach for E2E testing
- Keep the JSON output format for consistency

### Step 3: Validate the changes

Run the validation commands to ensure the changes work correctly.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes

- The project currently has no application tests in `src/`. The new test command should gracefully handle this by running vitest on the `src/` directory (vitest will report 0 tests found rather than failing).
- The ADW tests in `adws/__tests__/` use vitest with mocking for child_process and other modules.
- E2E tests in this project use Playwright MCP Server (Model Context Protocol) rather than traditional Playwright test files. The E2E command guides an agent through browser automation steps.
- The `npm test` script already runs `vitest run`, so filtering tests by directory uses `npm test -- --run <directory>`.
