# PR-Review: Resolve merge conflicts with develop branch

## PR-Review Description
PR #189 (`chore-issue-188-add-playwright-e2e-tests`) has merge conflicts with the `develop` base branch. The `develop` branch received changes from PRs #185 (dedicated app instance per worktree) and #187 (pass classification to orchestrator) which modified several of the same files that this PR changed. The conflicts must be resolved by merging `develop` into the feature branch, preserving both the Playwright e2e conversion (our changes) and the port allocation / applicationUrl features (develop's changes).

### Conflict Summary

1. **`adws/agents/testAgent.ts`** (content conflict) — Our branch rewrote E2E test execution to use Playwright subprocess (`runPlaywrightE2ETests`), removing `runE2ETestAgent` and the `E2ETestAgentResult` interface. Develop added `applicationUrl` parameter support to `runE2ETestAgent` and `runResolveE2ETestAgent`. Resolution: keep our Playwright subprocess approach but incorporate develop's `applicationUrl` parameter into `runResolveE2ETestAgent`.

2. **`adws/agents/testRetry.ts`** (content conflict) — Our branch rewrote `runE2ETestsWithRetry` to call `runPlaywrightE2ETests` instead of individual `runE2ETestAgent` calls. Develop added `applicationUrl` support throughout. Resolution: keep our Playwright subprocess approach but accept the `applicationUrl` option from develop's `TestRetryOptions` and pass it where applicable.

3. **`.claude/commands/test_e2e.md`** (modify/delete) — Our branch deleted this file. Develop modified it (added `applicationUrl` variable). Resolution: keep it deleted (the whole point of this PR is removing AI-driven e2e tests).

4. **`e2e-tests/test_characters_overview.md`** (modify/delete) — Our branch deleted this file. Develop modified it. Resolution: keep it deleted (replaced by `.spec.ts` files).

5. **`adws/core/config.ts`** (auto-merged, needs verification) — Our branch removed `/test_e2e` from `SLASH_COMMAND_MODEL_MAP`. Develop added `'PORT'` to `SAFE_ENV_VARS`. Both changes should be preserved.

6. **`adws/__tests__/testAgent.test.ts`** (auto-merged, needs verification) — Our branch replaced MCP-based test mocks with Playwright subprocess mocks. Develop added `applicationUrl` test cases. The auto-merge result needs verification.

### New files from develop to accept
- `adws/core/portAllocator.ts` — Port allocation utility (accept as-is)
- `adws/__tests__/portAllocator.test.ts` — Port allocator tests (accept as-is)
- Updated `.claude/commands/prepare_app.md`, `.claude/commands/start.md`, `.claude/commands/review.md`, `.claude/commands/resolve_failed_e2e_test.md` — Accept develop's changes (PORT/applicationUrl support)
- Updated e2e-screenshots — Accept develop's renamed/new screenshots

## Summary of Original Implementation Plan
The original plan (`specs/issue-188-adw-unknown-sdlc_planner-convert-e2e-to-playwright-specs.md`) converted e2e tests from AI-driven markdown specs (using the Playwright MCP) to standalone Playwright test specs. Key changes: added `@playwright/test` as a dev dependency, created `playwright.config.ts`, converted 4 `.md` e2e test files to `.spec.ts` Playwright tests, removed the old markdown e2e test files and `/test_e2e` command, removed the Playwright MCP from `.mcp.json`, updated `testAgent.ts` to run Playwright via subprocess with `runPlaywrightE2ETests()`, and updated `testRetry.ts` to use subprocess results instead of Claude agent results.

## Relevant Files
Use these files to resolve the review:

- `adws/agents/testAgent.ts` — Content conflict: our Playwright subprocess approach vs develop's applicationUrl additions. Must merge both.
- `adws/agents/testRetry.ts` — Content conflict: our Playwright subprocess approach vs develop's applicationUrl/TestRetryOptions additions. Must merge both.
- `adws/__tests__/testAgent.test.ts` — Auto-merged but needs verification. Develop added applicationUrl tests for the old MCP approach which must be adapted to the new Playwright approach.
- `adws/core/config.ts` — Auto-merged. Verify both `/test_e2e` removal and `PORT` in SAFE_ENV_VARS are present.
- `.claude/commands/test_e2e.md` — Modify/delete conflict. Keep deleted.
- `e2e-tests/test_characters_overview.md` — Modify/delete conflict. Keep deleted.
- `.claude/commands/prepare_app.md` — Accept develop's PORT variable additions.
- `.claude/commands/start.md` — Accept develop's PORT variable change.
- `.claude/commands/review.md` — Accept develop's applicationUrl additions.
- `.claude/commands/resolve_failed_e2e_test.md` — Accept develop's applicationUrl field addition.
- `adws/core/portAllocator.ts` — New file from develop. Accept as-is.
- `adws/__tests__/portAllocator.test.ts` — New file from develop. Accept as-is.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Start the merge from develop

- Run `git fetch origin develop` to ensure the latest develop ref is available
- Run `git merge origin/develop` to begin the merge (this will report conflicts)
- Verify the list of conflicting files matches the expected set:
  - `.claude/commands/test_e2e.md` (modify/delete)
  - `adws/agents/testAgent.ts` (content)
  - `adws/agents/testRetry.ts` (content)
  - `e2e-tests/test_characters_overview.md` (modify/delete)

### Step 2: Resolve modify/delete conflicts (deleted files)

- For `.claude/commands/test_e2e.md`: run `git rm .claude/commands/test_e2e.md` — this file was intentionally deleted by our PR (e2e tests now run via Playwright subprocess, not via Claude agent MCP).
- For `e2e-tests/test_characters_overview.md`: run `git rm e2e-tests/test_characters_overview.md` — this markdown test was replaced by `e2e-tests/characters-overview.spec.ts`.

### Step 3: Resolve `adws/agents/testAgent.ts` content conflict

- Open the file and examine the conflict markers
- Keep our branch's version as the base (Playwright subprocess approach) with these adjustments:
  - **Keep our `E2ETestResult` interface** (without `screenshots` field — Playwright handles screenshots via config)
  - **Keep our `PlaywrightE2EResult` interface** and `runPlaywrightE2ETests()` function
  - **Keep our `discoverE2ETestFiles()`** filtering `.spec.ts` files
  - **Keep our `extractSpecResults()`** and related Playwright JSON types
  - **Remove develop's `runE2ETestAgent()`** and `E2ETestAgentResult` — these are from the old MCP approach
  - **Remove develop's `extractJson` import** — not needed (only `extractJsonArray` is used)
  - **Incorporate develop's `applicationUrl` parameter** into `runResolveE2ETestAgent()`: add the optional `applicationUrl` parameter and include it in the failure JSON payload when provided (matching develop's approach)
- The final file should export: `TestResult`, `E2ETestResult`, `PlaywrightE2EResult`, `TestAgentResult`, `isValidE2ETestResult`, `runTestAgent`, `runResolveTestAgent`, `runResolveE2ETestAgent`, `discoverE2ETestFiles`, `runPlaywrightE2ETests`, and the Playwright JSON types.
- Run `git add adws/agents/testAgent.ts`

### Step 4: Resolve `adws/agents/testRetry.ts` content conflict

- Open the file and examine the conflict markers
- Keep our branch's version as the base (Playwright subprocess approach) with these adjustments:
  - **Accept develop's `applicationUrl` field** in the `TestRetryOptions` interface
  - **Keep our `runE2ETestsWithRetry()`** implementation that calls `runPlaywrightE2ETests()` instead of individual `runE2ETestAgent()` calls
  - **Remove develop's `runE2ETestAgent` import** (not used in our approach)
  - **Keep our import list**: `runPlaywrightE2ETests` instead of `runE2ETestAgent`
  - **Pass `applicationUrl`** to `runResolveE2ETestAgent()` calls within the retry loop (develop added this parameter)
  - Destructure `applicationUrl` from `opts` alongside the other parameters
- Run `git add adws/agents/testRetry.ts`

### Step 5: Verify auto-merged files

- Read `adws/core/config.ts` and verify:
  - `/test_e2e` is NOT in `SLASH_COMMAND_MODEL_MAP` (our change)
  - `'PORT'` IS in `SAFE_ENV_VARS` array (develop's change)
- Read `adws/__tests__/testAgent.test.ts` and verify:
  - The `discoverE2ETestFiles` tests use `.spec.ts` files (our change)
  - The `runPlaywrightE2ETests` tests are present (our change)
  - The `runResolveE2ETestAgent` tests are present and work with the updated interface (no `screenshots` field)
  - The `isValidE2ETestResult` tests use the updated interface (no `screenshots` field)
  - If auto-merge left develop's `runE2ETestAgent` tests, remove them (function no longer exists)
  - If auto-merge left develop's `applicationUrl` tests for `runE2ETestAgent`, remove them
  - Add a test for `runResolveE2ETestAgent` that verifies `applicationUrl` is included in the failure JSON payload when provided
- Run `git add adws/__tests__/testAgent.test.ts adws/core/config.ts`

### Step 6: Accept new files from develop

- Verify these files were auto-added by the merge:
  - `adws/core/portAllocator.ts`
  - `adws/__tests__/portAllocator.test.ts`
  - `.claude/commands/prepare_app.md` (updated)
  - `.claude/commands/start.md` (updated)
  - `.claude/commands/review.md` (updated)
  - `.claude/commands/resolve_failed_e2e_test.md` (updated)
  - New/renamed e2e-screenshots files
- Run `git add` on any that are not yet staged

### Step 7: Finalize the merge commit

- Run `git status` to verify all conflicts are resolved and no unmerged files remain
- Run `git commit` (without `--no-edit`) to create the merge commit with the default merge message

### Step 8: Run validation commands

- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all unit tests pass with zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The key principle for resolving these conflicts is: **our Playwright subprocess approach wins** for e2e test execution, but **develop's port allocation and applicationUrl features should be incorporated** where they apply (resolve agent, test retry options, slash commands).
- The `runE2ETestAgent()` function from develop is completely removed — it was the old MCP-based approach. However, `runResolveE2ETestAgent()` is kept (it uses Claude to analyze and fix failures) and should accept the `applicationUrl` parameter that develop added.
- The `E2ETestResult` interface in our branch intentionally drops the `screenshots` field that existed in develop's version. In the new approach, Playwright handles screenshots via its config (`only-on-failure`), not via the result interface.
- The `/test_e2e` slash command and its `SlashCommand` type entry were already removed by our branch (Step 9 of original plan). This is correct because e2e tests now run via `npx playwright test` subprocess.
- After the merge, the `runE2ETestsWithRetry` function should follow this flow: (1) discover `.spec.ts` files, (2) run all via `runPlaywrightE2ETests()`, (3) for failures, call `runResolveE2ETestAgent()` with `applicationUrl`, (4) re-run `runPlaywrightE2ETests()` after resolution.
