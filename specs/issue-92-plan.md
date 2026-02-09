# PR-Review: Refactor adwPrReview to use workflowPhases library and standardize JSDoc

## PR-Review Description
The PR reviewer (`paysdoc`) noted that `adwPrReview.tsx` probably has a lot of overlap with the other orchestrators and should be refactored to use functions from the `workflowPhases` library. The JSDoc should also be updated to follow the same consistent pattern used by the other orchestrators (`adwPlan.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`).

Currently `adwPrReview.tsx` is 296 lines of standalone code that manually orchestrates: initialization, state management, PR-specific plan/build agents, test retry with PR-specific callbacks, commit/push, and error handling. The three other orchestrators have already been refactored to ~60-90 lines each by composing shared phase functions from `workflowPhases.ts`. The `adwPrReview` orchestrator was not included in that refactoring and still duplicates significant infrastructure patterns.

The key challenge is that `adwPrReview` differs from the issue-based orchestrators in several ways:
- It operates on a **PR number** (not an issue number) and fetches PR details instead of issue details
- It uses **PR-specific agents** (`runPrReviewPlanAgent`, `runPrReviewBuildAgent`) instead of `runPlanAgent`/`runBuildAgent`
- It posts **PR review workflow comments** (`postPRWorkflowComment` with `PRReviewWorkflowContext`) instead of issue workflow comments
- It has a custom **test failure callback** (`onTestFailed`) that posts PR-specific comments
- It **commits and pushes** to the existing PR branch rather than creating a new PR
- It does **not** need issue classification, branch creation, recovery state detection, or PR creation phases

The refactoring strategy should create PR-review-specific phase functions in `workflowPhases.ts` that mirror the compositional pattern of the existing functions, while reusing the underlying shared utilities (agent state management, test retry, etc.).

## Summary of Original Implementation Plan
The original plan at `specs/issue-92-plan.md` addressed streamlining the three issue-based orchestrators by:
- Creating `adws/workflowPhases.ts` with composable phase functions (`initializeWorkflow`, `executePlanPhase`, `executeBuildPhase`, `executeTestPhase`, `executePRPhase`, `completeWorkflow`, `handleWorkflowError`)
- Creating `adws/core/orchestratorLib.ts` with shared utilities
- Adding branch synchronization via `mergeLatestFromDefaultBranch`
- Refactoring all three orchestrators to ~60-90 lines each

The implementation was successful - all three issue-based orchestrators now use the shared `workflowPhases.ts` library. However, `adwPrReview.tsx` was not included in that refactoring, which is what this PR review comment addresses.

## Relevant Files
Use these files to resolve the review:

- `adws/adwPrReview.tsx` (296 lines) - The PR review orchestrator to be refactored. Currently contains all workflow logic inline: initialization, state management, plan/build agents, test retry with PR-specific callbacks, commit/push, error handling. Must be reduced to a thin composition of shared phase functions.
- `adws/workflowPhases.ts` (544 lines) - The shared workflow phases library. Must be extended with PR-review-specific phase functions that parallel the existing issue-based functions. This file will grow but the shared phases approach consolidates logic in one place.
- `adws/adwPlan.tsx` (113 lines) - Reference for the target orchestrator pattern: ~60-90 lines with JSDoc format, argument parsing, and a `main()` that composes shared phases.
- `adws/adwPlanBuild.tsx` (83 lines) - Reference for the target orchestrator pattern.
- `adws/adwPlanBuildTest.tsx` (92 lines) - Reference for the target orchestrator pattern (includes test phase).
- `adws/github/workflowCommentsPR.ts` - Contains `PRReviewWorkflowContext` and `postPRWorkflowComment`. Already exists and will continue to be used by the PR-review phase functions.
- `adws/agents/planAgent.ts` - Contains `runPrReviewPlanAgent` (takes `PRDetails`, `PRReviewComment[]`, `existingPlanContent`).
- `adws/agents/buildAgent.ts` - Contains `runPrReviewBuildAgent` (takes `PRDetails`, `revisionPlan`).
- `adws/agents/testRetry.ts` - Contains `runUnitTestsWithRetry` and `runE2ETestsWithRetry` with `onTestFailed` callback. Already shared and used by both `workflowPhases.ts` and `adwPrReview.tsx`.
- `adws/github/index.ts` - GitHub module barrel exports. May need new exports if any new functions are created.
- `adws/index.ts` - Root barrel exports. Must export any new shared functions added to `workflowPhases.ts`.
- `adws/__tests__/workflowPhases.test.ts` - Existing tests for workflow phases. Must be extended with tests for the new PR-review phase functions.
- `adws/core/dataTypes.ts` - Contains `PRDetails`, `PRReviewComment`, `PRReviewWorkflowStage` types.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add PR-review phase functions to `adws/workflowPhases.ts`

Add the following PR-review-specific types and functions to `workflowPhases.ts`. These mirror the compositional pattern of the existing issue-based functions.

- **Add new imports** at the top of the file:
  - From `./core`: `type PRDetails`, `type PRReviewComment`, `type PRReviewWorkflowStage`, `commitPrefixMap`
  - From `./github`: `fetchPRDetails`, `getUnaddressedComments`, `postPRWorkflowComment`, `type PRReviewWorkflowContext`, `inferIssueTypeFromBranch`, `ensureWorktree`, `commitChanges`, `pushBranch`
  - From `./agents`: `runPrReviewPlanAgent`, `runPrReviewBuildAgent`, `getPlanFilePath`, `type ProgressCallback`, `type ProgressInfo`, `runUnitTestsWithRetry`, `runE2ETestsWithRetry`
  - Note: Many of these are already imported - only add the ones not yet present.

- **Define `PRReviewWorkflowConfig` interface**:
  ```typescript
  export interface PRReviewWorkflowConfig {
    prNumber: number;
    issueNumber: number;
    adwId: string;
    prDetails: PRDetails;
    unaddressedComments: PRReviewComment[];
    worktreePath: string;
    logsDir: string;
    orchestratorStatePath: string;
    ctx: PRReviewWorkflowContext;
  }
  ```

- **Implement `initializePRReviewWorkflow()`**:
  - Signature: `export function initializePRReviewWorkflow(prNumber: number, adwId: string): PRReviewWorkflowConfig`
  - Steps:
    1. Log banner (PR Review orchestrator, PR number, ADW ID)
    2. Call `fetchPRDetails(prNumber)` and log PR title
    3. Check if PR is CLOSED or MERGED - if so, log and call `process.exit(0)`
    4. Call `getUnaddressedComments(prNumber)` - if empty, log and call `process.exit(0)`
    5. Log count of unaddressed comments
    6. Initialize logs via `ensureLogsDirectory(adwId)`
    7. Get `issueNumber` from `prDetails.issueNumber`
    8. Initialize orchestrator state via `AgentStateManager.initializeState(adwId, 'pr-review-orchestrator')`
    9. Write initial orchestrator state with metadata `{ prNumber, reviewComments: count }`
    10. Create `PRReviewWorkflowContext` with `issueNumber`, `adwId`, `prNumber`, `reviewComments` count, `branchName`
    11. Create worktree via `ensureWorktree(prDetails.headBranch)`
    12. Post `'pr_review_starting'` comment
    13. Return assembled `PRReviewWorkflowConfig`

- **Implement `executePRReviewPlanPhase()`**:
  - Signature: `export async function executePRReviewPlanPhase(config: PRReviewWorkflowConfig): Promise<{ planOutput: string }>`
  - Steps:
    1. Read existing plan content: try `fs.readFileSync(getPlanFilePath(issueNumber))`, fall back to `prDetails.body`
    2. Post `'pr_review_planning'` comment
    3. Initialize plan agent sub-state (agent name: `'pr-review-plan-agent'`, parent: `'pr-review-orchestrator'`)
    4. Call `runPrReviewPlanAgent(prDetails, unaddressedComments, existingPlanContent, logsDir, planAgentStatePath, worktreePath)`
    5. Handle failure: update agent state, throw error
    6. On success: update agent state, update orchestrator log
    7. Set `ctx.revisionPlanOutput`, post `'pr_review_planned'` comment
    8. Return `{ planOutput: planResult.output }`

- **Implement `executePRReviewBuildPhase()`**:
  - Signature: `export async function executePRReviewBuildPhase(config: PRReviewWorkflowConfig, planOutput: string): Promise<void>`
  - Steps:
    1. Post `'pr_review_implementing'` comment
    2. Initialize build agent sub-state (agent name: `'pr-review-build-agent'`, parent: `'pr-review-orchestrator'`)
    3. Set up progress callback that logs tool use
    4. Call `runPrReviewBuildAgent(prDetails, planOutput, logsDir, buildProgressCallback, buildAgentStatePath, worktreePath)`
    5. Handle failure: update agent state, throw error
    6. On success: update agent state, update orchestrator log
    7. Set `ctx.revisionBuildOutput`, post `'pr_review_implemented'` comment

- **Implement `executePRReviewTestPhase()`**:
  - Signature: `export async function executePRReviewTestPhase(config: PRReviewWorkflowConfig): Promise<void>`
  - Steps:
    1. Post `'pr_review_testing'` comment, log, append to orchestrator state
    2. Create `onTestFailed` callback that sets `ctx.testAttempt`/`ctx.maxTestAttempts` and posts `'pr_review_test_failed'`
    3. Call `runUnitTestsWithRetry({ logsDir, orchestratorStatePath, maxRetries: MAX_TEST_RETRY_ATTEMPTS, onTestFailed, cwd: worktreePath })`
    4. If unit tests fail: set `ctx.failedTests`/`ctx.maxTestAttempts`, post `'pr_review_test_max_attempts'`, update orchestrator state with failure metadata, log error, call `process.exit(1)`
    5. Call `runE2ETestsWithRetry(...)` with same pattern
    6. If E2E tests fail: same error handling as unit tests
    7. Post `'pr_review_test_passed'`, log success, append to orchestrator state

- **Implement `completePRReviewWorkflow()`**:
  - Signature: `export function completePRReviewWorkflow(config: PRReviewWorkflowConfig): void`
  - Steps:
    1. Post `'pr_review_committing'` comment
    2. Infer issue type from branch via `inferIssueTypeFromBranch(prDetails.headBranch)`
    3. Build commit message using `commitPrefixMap[issueType]`
    4. Call `commitChanges(commitMsg, worktreePath)`
    5. Call `pushBranch(prDetails.headBranch, worktreePath)`
    6. Post `'pr_review_pushed'` and `'pr_review_completed'` comments
    7. Update orchestrator state with successful execution
    8. Log completion info (PR URL, comments addressed count)

- **Implement `handlePRReviewWorkflowError()`**:
  - Signature: `export function handlePRReviewWorkflowError(config: PRReviewWorkflowConfig, error: unknown): never`
  - Steps:
    1. Set `ctx.errorMessage = String(error)`
    2. Post `'pr_review_error'` comment via `postPRWorkflowComment`
    3. Update orchestrator state with failed execution
    4. Append error log
    5. Log error
    6. Call `process.exit(1)`

### Step 2: Update `adws/index.ts` - Export new PR-review shared functions

- Add the new exports to the existing `Workflow Phases` export block:
  ```typescript
  export {
    type WorkflowConfig,
    type PRReviewWorkflowConfig,
    initializeWorkflow,
    initializePRReviewWorkflow,
    executePlanPhase,
    executeBuildPhase,
    executeTestPhase,
    executePRPhase,
    executePRReviewPlanPhase,
    executePRReviewBuildPhase,
    executePRReviewTestPhase,
    completePRReviewWorkflow,
    handlePRReviewWorkflowError,
    completeWorkflow,
    handleWorkflowError,
  } from './workflowPhases';
  ```

### Step 3: Refactor `adws/adwPrReview.tsx` - Use shared PR-review phases + consistent JSDoc

- **Update the JSDoc** to match the standardized format used by the other orchestrators:
  ```
  #!/usr/bin/env npx tsx
  /**
   * ADW PR Review - AI Developer Workflow for PR Review Comments
   *
   * Usage: npx tsx adws/adwPrReview.tsx <pr-number>
   *
   * Workflow:
   * 1. Initialize: fetch PR details, detect unaddressed comments, setup worktree, initialize state
   * 2. Plan Phase: read existing plan, run PR review plan agent
   * 3. Build Phase: run PR review build agent to implement revision plan
   * 4. Test Phase: run unit tests with retry, run E2E tests with retry
   * 5. Finalize: commit and push changes, post completion comment
   *
   * Environment Requirements:
   * - ANTHROPIC_API_KEY: Anthropic API key
   * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
   */
  ```

- **Replace all imports** with:
  ```typescript
  import { generateAdwId } from './core';
  import {
    initializePRReviewWorkflow,
    executePRReviewPlanPhase,
    executePRReviewBuildPhase,
    executePRReviewTestPhase,
    completePRReviewWorkflow,
    handlePRReviewWorkflowError,
  } from './workflowPhases';
  ```

- **Refactor `main()` function** to compose shared phases:
  ```typescript
  async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length < 1) {
      console.error('Usage: npx tsx adws/adwPrReview.tsx <pr-number>');
      process.exit(1);
    }

    const prNumber = parseInt(args[0], 10);
    if (isNaN(prNumber)) {
      console.error(`Invalid PR number: ${args[0]}`);
      process.exit(1);
    }

    const adwId = generateAdwId();
    const config = initializePRReviewWorkflow(prNumber, adwId);

    try {
      const { planOutput } = await executePRReviewPlanPhase(config);
      await executePRReviewBuildPhase(config, planOutput);
      await executePRReviewTestPhase(config);
      completePRReviewWorkflow(config);
    } catch (error) {
      handlePRReviewWorkflowError(config, error);
    }
  }

  main();
  ```

- **Remove** all inline workflow logic that is now in the shared phase functions.
- **Target file size**: ~40-50 lines (down from 296).

### Step 4: Update tests in `adws/__tests__/workflowPhases.test.ts`

- Add tests for the new PR-review phase functions following existing test patterns (vitest, `vi.mock`, `vi.mocked`).
- Mock all external dependencies (`child_process`, `fs`, agent functions, github functions, `AgentStateManager`).

- **Test `initializePRReviewWorkflow()`**:
  - Test that `fetchPRDetails()` is called with the PR number
  - Test that closed/merged PRs cause `process.exit(0)`
  - Test that no unaddressed comments cause `process.exit(0)`
  - Test that worktree is set up via `ensureWorktree(headBranch)`
  - Test that orchestrator state is initialized with correct metadata
  - Test that `'pr_review_starting'` comment is posted

- **Test `executePRReviewPlanPhase()`**:
  - Test that existing plan content is read from file when available
  - Test fallback to PR body when no plan file exists
  - Test that `runPrReviewPlanAgent` is called with correct arguments
  - Test that failure throws an error

- **Test `executePRReviewBuildPhase()`**:
  - Test that `runPrReviewBuildAgent` is called with plan output
  - Test that failure throws an error

- **Test `executePRReviewTestPhase()`**:
  - Test that both unit and E2E test retry functions are called
  - Test that `onTestFailed` callback posts correct PR comment
  - Test that `process.exit(1)` is called on max retry failure

- **Test `completePRReviewWorkflow()`**:
  - Test that commit message uses correct prefix from `inferIssueTypeFromBranch`
  - Test that `pushBranch` is called
  - Test that completion comments are posted

- **Test `handlePRReviewWorkflowError()`**:
  - Test that error comment is posted and `process.exit(1)` is called

### Step 5: Run validation commands
- Execute `npm run lint` to check for code quality issues
- Execute `npm run build` to verify no build errors
- Execute `npm test` to validate zero regressions, including the new tests

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `PRReviewWorkflowConfig` is intentionally separate from `WorkflowConfig` because the PR review workflow operates on fundamentally different inputs (PR number, PR details, review comments) rather than (issue number, issue details, issue type). Trying to unify them into a single config type would require numerous optional fields and conditional logic, making the code harder to understand.
- The PR review workflow does NOT use `shouldExecuteStage()` / recovery state detection because PR reviews are always executed fresh - there is no concept of resuming a partially-completed PR review from a previous run.
- The `executePRReviewTestPhase` uses the `onTestFailed` callback from `TestRetryOptions` to post PR-specific failure comments. This callback mechanism already exists in the shared `testRetry.ts` and is simply wired up differently for PR reviews (posting to the PR) vs issue workflows (no callback, handled in the phase function).
- The `completePRReviewWorkflow` commits and pushes directly (unlike the issue workflow's `executePRPhase` which creates a new PR) because the PR already exists.
- The file `workflowPhases.ts` will grow by approximately 150-180 lines. This keeps all orchestrator composition logic in one module, consistent with the architectural decision from the original plan.
