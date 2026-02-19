# Chore: Dedicated App Instance Per Worktree

## Metadata
issueNumber: `182`
adwId: `adw-unknown`
issueJson: `{"title":"Start a new instance of the application for each issue","body":"Each issue is being implemented in its own git worktree.\nMake sure that when it comes to the review step, e2e tests are running on their own dedicated instance of the application started from within the worktree. To avoif port conflicts the port is randomized, save for the duration of the run and passed to the e2e test."}`

## Chore Description
Currently, e2e tests and the review step rely on a hardcoded `http://localhost:3000` application URL. When multiple worktrees are running concurrently (each processing a different issue), they all try to start the dev server on port 3000, causing port conflicts.

This chore ensures that each worktree gets its own dedicated Next.js dev server instance on a randomized port. The port is:
1. Randomly selected (from a high ephemeral range to avoid conflicts)
2. Persisted for the duration of the workflow run (so all phases use the same port)
3. Passed to e2e tests and review commands via the `applicationUrl` variable

The changes span the ADW orchestration layer (port allocation and lifecycle), the slash commands (`prepare_app.md`, `test_e2e.md`, `start.md`), and the e2e test files that currently hardcode `localhost:3000`.

## Relevant Files
Use these files to resolve the chore:

- `adws/core/config.ts` — Add a helper function to pick a random available port and a constant for the default port. Add `PORT` to the `SAFE_ENV_VARS` allowlist so it propagates to Claude CLI subprocesses.
- `adws/agents/testAgent.ts` — Update `runE2ETestAgent` and `runResolveE2ETestAgent` to accept and forward an `applicationUrl` parameter to the `/test_e2e` and `/resolve_failed_e2e_test` slash commands.
- `adws/agents/testRetry.ts` — Update `TestRetryOptions` and `runE2ETestsWithRetry` to accept and forward `applicationUrl` through to `runE2ETestAgent` / `runResolveE2ETestAgent`.
- `adws/agents/reviewAgent.ts` — Update `runReviewAgent` to accept and forward an `applicationUrl` parameter to the `/review` slash command.
- `adws/agents/reviewRetry.ts` — Update `ReviewRetryOptions` and `runReviewWithRetry` to accept and forward `applicationUrl` through to `runReviewAgent`.
- `adws/agents/index.ts` — Re-export any new types added.
- `adws/phases/testPhase.ts` — Update `executeTestPhase` to receive `applicationUrl` from `WorkflowConfig` and pass it through to `runE2ETestsWithRetry`.
- `adws/phases/prReviewPhase.ts` — Update `executePRReviewTestPhase` to receive `applicationUrl` from `PRReviewWorkflowConfig` and pass it through to `runE2ETestsWithRetry`. Update `initializePRReviewWorkflow` to allocate a port and store it in the config.
- `adws/phases/workflowLifecycle.ts` — Update `WorkflowConfig` to include `applicationUrl`. Update `initializeWorkflow` to allocate a random port and build the URL. Update `executeReviewPhase` to pass `applicationUrl` to `runReviewWithRetry`.
- `.claude/commands/prepare_app.md` — Parameterize the port: use a `PORT` variable instead of hardcoded 3000. Start the dev server with `npx next dev --port $PORT` from the worktree directory.
- `.claude/commands/test_e2e.md` — The `applicationUrl` variable ($4) already exists but defaults to 3000. Ensure it is always passed explicitly by the orchestration layer.
- `.claude/commands/start.md` — Parameterize the PORT variable to accept a dynamic value.
- `.claude/commands/review.md` — Add `applicationUrl` as a variable ($4) and pass it through to `prepare_app.md`.
- `.claude/commands/resolve_failed_e2e_test.md` — Add `applicationUrl` as a variable and pass it through when re-running e2e tests.
- `e2e-tests/test_characters_overview.md` — Replace hardcoded `http://localhost:3000` with the `applicationUrl` variable reference.
- `e2e-tests/test_character_detail.md` — Replace hardcoded URL if present.
- `e2e-tests/test_character_edit.md` — Replace hardcoded URL if present.
- `e2e-tests/test_character_image_display.md` — Replace hardcoded URL if present.
- `adws/__tests__/testAgent.test.ts` — Update tests to cover `applicationUrl` parameter.
- `adws/__tests__/reviewAgent.test.ts` — Update tests to cover `applicationUrl` parameter.
- `adws/__tests__/reviewRetry.test.ts` — Update tests to cover `applicationUrl` parameter.

### New Files
- `adws/core/portAllocator.ts` — Utility module that picks a random available port from the ephemeral range (e.g. 10000–60000), verifies it's not in use, and returns it. Exports `allocateRandomPort(): number`.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the port allocator utility

- Create `adws/core/portAllocator.ts` with a function `allocateRandomPort(): number` that:
  - Picks a random port between 10000 and 60000
  - Uses Node.js `net.createServer` to test if the port is available (bind, then close)
  - Retries up to 10 times if the port is in use
  - Returns the available port number
- Export `allocateRandomPort` from `adws/core/index.ts`

### Step 2: Update config.ts safe env vars

- Add `'PORT'` to the `SAFE_ENV_VARS` array in `adws/core/config.ts` so that the PORT environment variable is propagated to Claude CLI subprocesses

### Step 3: Update WorkflowConfig and initializeWorkflow

- Add `applicationUrl: string` field to the `WorkflowConfig` interface in `adws/phases/workflowLifecycle.ts`
- In `initializeWorkflow`, call `allocateRandomPort()` to get a port, build the URL as `http://localhost:${port}`, and include it in the returned config
- Log the allocated port for observability

### Step 4: Update PRReviewWorkflowConfig and initializePRReviewWorkflow

- Add `applicationUrl: string` field to the `PRReviewWorkflowConfig` interface in `adws/phases/prReviewPhase.ts`
- In `initializePRReviewWorkflow`, call `allocateRandomPort()` to get a port, build the URL, and include it in the returned config
- Log the allocated port for observability

### Step 5: Update testAgent.ts to accept applicationUrl

- Add an optional `applicationUrl` parameter to `runE2ETestAgent` function signature
- When `applicationUrl` is provided, pass it as the 4th positional argument to the `/test_e2e` slash command (the command already supports `$4` as `applicationUrl`)
- Add an optional `applicationUrl` parameter to `runResolveE2ETestAgent` function signature
- When `applicationUrl` is provided, include it in the failure JSON passed to `/resolve_failed_e2e_test` so the resolver knows which URL to use

### Step 6: Update testRetry.ts to thread applicationUrl

- Add an optional `applicationUrl?: string` field to `TestRetryOptions` interface
- In `runE2ETestsWithRetry`, pass `applicationUrl` through to every `runE2ETestAgent` and `runResolveE2ETestAgent` call

### Step 7: Update reviewAgent.ts to accept applicationUrl

- Add an optional `applicationUrl` parameter to `runReviewAgent` function signature
- When `applicationUrl` is provided, append it as a 4th line in the args string passed to the `/review` slash command

### Step 8: Update reviewRetry.ts to thread applicationUrl

- Add an optional `applicationUrl?: string` field to `ReviewRetryOptions` interface
- In `runReviewWithRetry`, pass `applicationUrl` through to `runReviewAgent`

### Step 9: Update testPhase.ts to pass applicationUrl

- In `executeTestPhase`, extract `applicationUrl` from the `WorkflowConfig` parameter
- Pass `applicationUrl` to `runE2ETestsWithRetry`

### Step 10: Update prReviewPhase.ts to pass applicationUrl

- In `executePRReviewTestPhase`, extract `applicationUrl` from `PRReviewWorkflowConfig`
- Pass `applicationUrl` to `runE2ETestsWithRetry`

### Step 11: Update workflowLifecycle.ts executeReviewPhase

- In `executeReviewPhase`, pass `applicationUrl` from the config to `runReviewWithRetry`

### Step 12: Update prepare_app.md slash command

- Change the `PORT` variable to: `PORT: $1 if provided, otherwise use 3000`
- Change step 2 from `npm run dev` to `npx next dev --port PORT`
- Change step 3 to wait on `http://localhost:PORT` instead of hardcoded 3000

### Step 13: Update test_e2e.md slash command

- Ensure the `applicationUrl` variable documentation is clear: `$4 if provided, otherwise use http://localhost:3000`
- In the Setup section, update the `prepare_app.md` invocation to pass the port extracted from `applicationUrl` so the app starts on the correct port

### Step 14: Update review.md slash command

- Add `applicationUrl: $4 if provided, otherwise use http://localhost:3000` to the Variables section
- In the Setup section, update the `prepare_app.md` invocation to pass the port extracted from `applicationUrl`
- Use `applicationUrl` when navigating to the application for screenshots

### Step 15: Update resolve_failed_e2e_test.md slash command

- Add `applicationUrl` to the Instructions, noting that when the failure JSON contains an `applicationUrl` field, the resolver should use that URL when re-running the test

### Step 16: Update e2e test files to use applicationUrl

- In `e2e-tests/test_characters_overview.md`, replace `http://localhost:3000` with `the applicationUrl` (the test runner will substitute it)
- Check and update `e2e-tests/test_character_detail.md`, `test_character_edit.md`, `test_character_image_display.md` similarly if they contain hardcoded localhost URLs

### Step 17: Update start.md slash command

- Change `PORT: 3000` to `PORT: $1 if provided, otherwise 3000` to support dynamic ports

### Step 18: Update existing tests

- Update `adws/__tests__/testAgent.test.ts` to verify that `applicationUrl` is correctly forwarded in the command args
- Update `adws/__tests__/reviewAgent.test.ts` to verify that `applicationUrl` is appended as the 4th arg line
- Update `adws/__tests__/reviewRetry.test.ts` to verify `applicationUrl` is threaded through to `runReviewAgent`
- Add a unit test for `allocateRandomPort` in a new test file `adws/__tests__/portAllocator.test.ts`

### Step 19: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to validate zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The port allocator must be async since it uses `net.createServer` to test port availability. All callers up the chain already use `async/await`.
- The `prepare_app.md` command is invoked by both `test_e2e.md` and `review.md`. By parameterizing it to accept a port, both consumers can pass the dynamic port through.
- The e2e test files (`e2e-tests/*.md`) are read by the `/test_e2e` command which already has an `applicationUrl` variable. The test files should reference the application URL generically rather than hardcoding `localhost:3000` so they work regardless of port.
- `SAFE_ENV_VARS` in config.ts must include `PORT` so that when a subprocess (Claude CLI) is spawned, it can inherit the port setting if needed.
- The random port range (10000–60000) avoids well-known ports and stays within typical ephemeral ranges on macOS/Linux.
