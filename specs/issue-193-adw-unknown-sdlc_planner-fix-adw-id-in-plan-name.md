# Bug: ADW ID not shown in plan name

## Metadata
issueNumber: `193`
adwId: `unknown`
issueJson: `{}`

## Bug Description
When the ADW pipeline runs the plan agent to create a plan spec file, the generated filename contains `adw-unknown` instead of the actual ADW ID. For example, plan files are named `issue-190-adw-unknown-sdlc_planner-fix-worktree-branch-removal.md` instead of `issue-190-adw-abc12345-sdlc_planner-fix-worktree-branch-removal.md`.

**Expected behavior:** The plan spec file name should include the actual ADW ID assigned to the workflow run (e.g., `issue-193-adw-a1b2c3d4-sdlc_planner-fix-something.md`).

**Actual behavior:** The plan spec file name always contains `adw-unknown` (e.g., `issue-193-adw-unknown-sdlc_planner-fix-something.md`).

## Problem Statement
The `runPlanAgent` function in `adws/agents/planAgent.ts` does not accept or pass the ADW ID to the slash command it invokes (`/bug`, `/feature`, `/chore`). These slash commands define the ADW ID as positional argument `$2` with a default of `adw-unknown`. Since the plan agent only passes one argument (the formatted issue context text), `$2` is never provided, causing the AI model to use the default `adw-unknown` value when naming the plan file.

## Solution Statement
1. Modify `runClaudeAgentWithCommand` in `claudeAgent.ts` to support an array of arguments (backward-compatible: `string | readonly string[]`). When an array is passed, each element is individually shell-quoted.
2. Add an `adwId` parameter to `runPlanAgent` and pass three positional arguments to the slash command: `$1` = formatted issue context, `$2` = adwId, `$3` = issueJson.
3. Update `executePlanPhase` to pass the `adwId` from the workflow config to `runPlanAgent`.
4. Update tests to verify the adwId is correctly propagated.

## Steps to Reproduce
1. Run `npx tsx adws/adwPlan.tsx <issueNumber>` for any open GitHub issue.
2. Check the generated plan file in `specs/`.
3. Observe the filename contains `adw-unknown` instead of the actual ADW ID.

## Root Cause Analysis
The data flow breaks at `runPlanAgent` in `adws/agents/planAgent.ts`:

1. `initializeWorkflow` in `workflowLifecycle.ts` correctly generates/resolves an ADW ID (line 49: `const resolvedAdwId = adwId ?? recoveryState.adwId ?? generateAdwId(issue.title)`) and stores it in `WorkflowConfig.adwId`.
2. `executePlanPhase` in `planPhase.ts` receives the config with `adwId` but does NOT pass it to `runPlanAgent` (line 76: `runPlanAgent(issue, logsDir, issueType, planAgentStatePath, worktreePath)` — no `adwId` parameter).
3. `runPlanAgent` in `planAgent.ts` constructs a single formatted text argument via `formatIssueContextAsArgs(issue)` and passes it to `runClaudeAgentWithCommand`. The ADW ID is not included anywhere in this text.
4. `runClaudeAgentWithCommand` wraps the single argument in quotes and sends it as the CLI prompt: `/bug '<formatted text>'`.
5. The slash command template (e.g., `.claude/commands/bug.md`) expects `$2` to be the adwId. Since only one argument is passed, `$2` is empty and defaults to `adw-unknown`.
6. The AI model uses `adw-unknown` when creating the plan file name.

Additionally, `runClaudeAgentWithCommand` only supports a single string argument, making it impossible to pass multiple positional arguments to slash commands.

## Relevant Files
Use these files to fix the bug:

- `adws/agents/claudeAgent.ts` — Contains `runClaudeAgentWithCommand` which constructs the CLI prompt. Needs to support `string[]` args for multi-argument slash commands.
- `adws/agents/planAgent.ts` — Contains `runPlanAgent` which invokes the plan slash command. Needs an `adwId` parameter and must pass it as a separate positional argument.
- `adws/phases/planPhase.ts` — Contains `executePlanPhase` which calls `runPlanAgent`. Needs to pass the `adwId` from the workflow config.
- `adws/__tests__/planAgent.test.ts` — Tests for planAgent functions. Needs a test to verify `runPlanAgent` passes the adwId correctly.
- `adws/__tests__/workflowPhases.test.ts` — Tests for workflow phases. Needs an assertion that `runPlanAgent` is called with the correct adwId.
- `adws/__tests__/cwdPropagation.test.ts` — Tests for cwd propagation through agents. May need updates for the new `runClaudeAgentWithCommand` array signature.
- `adws/README.md` — ADW documentation. Read for context on ADW ID usage.
- `guidelines/coding_guidelines.md` — Coding guidelines. Must be followed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `runClaudeAgentWithCommand` to support array arguments

- Open `adws/agents/claudeAgent.ts`
- Change the `args` parameter type from `string` to `string | readonly string[]` in the `runClaudeAgentWithCommand` function signature (line 268)
- Update the prompt construction logic (around line 278):
  - If `args` is an array, map each element through the shell-quote escaping and join with spaces: `args.map(a => \`'\${a.replace(/'/g, "'\\\\''")}'\`).join(' ')`
  - If `args` is a string, keep the existing behavior: `\`'\${args.replace(/'/g, "'\\\\''")}'\``
- Update the log message for args length (around line 301) to handle both types
- This change is fully backward-compatible: all existing callers pass a `string` and will continue to work unchanged

### Step 2: Add `adwId` parameter to `runPlanAgent`

- Open `adws/agents/planAgent.ts`
- Add an optional `adwId?: string` parameter to the `runPlanAgent` function (line 192), after the `cwd` parameter
- Build a JSON representation of the issue for `$3` (issueJson) containing at minimum: `number`, `title`, `body`, `state`, `author` (login), `labels` (names), `createdAt`
- Change the args passed to `runClaudeAgentWithCommand` from a single string to an array of three strings:
  - `$1`: the formatted issue context from `formatIssueContextAsArgs(issue)` (keeps current behavior as the primary bug description)
  - `$2`: `adwId || 'adw-unknown'`
  - `$3`: the JSON string of the issue
- The call should become: `runClaudeAgentWithCommand(issueType, [issueContext, adwId || 'adw-unknown', issueJson], 'Plan', outputFile, ...)`

### Step 3: Pass `adwId` from `executePlanPhase` to `runPlanAgent`

- Open `adws/phases/planPhase.ts`
- Update the `runPlanAgent` call on line 76 to include the `adwId` from the config:
  - Change from: `runPlanAgent(issue, logsDir, issueType, planAgentStatePath, worktreePath)`
  - Change to: `runPlanAgent(issue, logsDir, issueType, planAgentStatePath, worktreePath, adwId)`

### Step 4: Add unit tests for array args support in `claudeAgent`

- Open `adws/__tests__/cwdPropagation.test.ts`
- Add a test case in the `runClaudeAgentWithCommand` describe block that verifies:
  - When `args` is a `string[]`, each element is individually quoted in the prompt
  - The resulting prompt has the correct format: `/command 'arg1' 'arg2' 'arg3'`
  - Single quotes within array elements are properly escaped

### Step 5: Add unit test for `runPlanAgent` adwId propagation

- Open `adws/__tests__/planAgent.test.ts`
- Add a new `describe('runPlanAgent')` block that:
  - Mocks `runClaudeAgentWithCommand` from `'../agents/claudeAgent'`
  - Tests that when `adwId` is provided, `runClaudeAgentWithCommand` is called with an array arg where the second element is the adwId
  - Tests that when `adwId` is omitted, the second element defaults to `'adw-unknown'`

### Step 6: Update `workflowPhases.test.ts` assertion

- Open `adws/__tests__/workflowPhases.test.ts`
- In the `executePlanPhase` test at line 422, update the assertion to verify the adwId is passed:
  - Change from: `expect(runPlanAgent).toHaveBeenCalled()`
  - Change to: `expect(runPlanAgent).toHaveBeenCalledWith(expect.anything(), expect.anything(), '/feature', expect.anything(), '/mock/worktree', 'test-adw-id')`

### Step 7: Run Validation Commands

- Run all validation commands listed below to confirm the bug is fixed with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- This bug does NOT affect the UI — it only impacts the ADW pipeline's plan file naming. No E2E tests are needed.
- The change to `runClaudeAgentWithCommand` is backward-compatible. All existing callers pass a single `string` and continue to work unchanged. Only `runPlanAgent` will use the new array form.
- The `$1`, `$2`, `$3` variables in slash command templates (`.claude/commands/bug.md`, `feature.md`, `chore.md`) already have correct defaults defined by issue #175. This fix ensures the ADW pipeline actually passes the values instead of relying on defaults.
- Confirmed affected spec files in the repo that show the bug (all have `adw-unknown` in their name): `issue-190-adw-unknown-sdlc_planner-*.md`, `issue-188-adw-unknown-sdlc_planner-*.md`, `issue-182-adw-unknown-sdlc_planner-*.md`, etc.
