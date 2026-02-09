# PR-Review: Streamline orchestrator workflow consistency, reduce duplication, and add branch synchronization

## PR-Review Description
Three review comments on PR #93 identify issues with the orchestrator ADW scripts after the initial streamlining implementation:

1. **Inconsistent workflow descriptions** (`adwPlan.tsx` line 6): The docstring workflow descriptions in `adwPlan.tsx`, `adwPlanBuild.tsx`, and `adwPlanBuildTest.tsx` use different wording and structure, even though each workflow should be a progressive extension of the previous one (Plan -> Plan+Build+PR -> Plan+Build+Test+PR). They must use identical wording for shared steps so that each longer workflow is visibly an extension of the shorter one.

2. **Duplicated workflow steps** (`adwPlan.tsx` line 165): The three orchestrators contain significant code duplication. The Plan phase code (~80 lines) is nearly identical across all three files. The Build phase code (~70 lines) is nearly identical in `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`. Setup, recovery handling, completion, and error handling patterns are also duplicated. These common steps must be extracted to a shared library so each orchestrator becomes a thin composition of phases.

3. **Missing branch synchronization** (`adwPlan.tsx` line 263): Each workflow must call `checkoutDefaultBranch()` if the worktree has not yet been created, to ensure the latest work from origin is present before planning happens. If the worktree already exists, it must merge the latest changes from `origin/{defaultBranch}` into the worktree branch. Currently, none of the three orchestrators perform either of these operations.

## Summary of Original Implementation Plan
The original plan at `specs/issue-92-plan.md` addressed making all three orchestrators self-sufficient by:
- Creating `adws/core/orchestratorLib.ts` with shared utilities (`shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage`)
- Adding proper state management and recovery support to `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`
- Standardizing issue classification to use `classifyGitHubIssue()` across all orchestrators
- Eliminating cross-orchestrator subprocess calls
- Adding consistent workflow comments at each stage

The implementation successfully made all orchestrators self-sufficient, but the resulting code has significant duplication that the reviewers now want extracted, inconsistent workflow descriptions, and missing branch synchronization logic.

## Relevant Files
Use these files to resolve the review:

- `adws/adwPlan.tsx` - Plan-only orchestrator (~300 lines). Contains the Plan phase workflow that is duplicated in the other two orchestrators. Needs workflow docstring standardization, extraction of phase code to shared library, and branch sync logic.
- `adws/adwPlanBuild.tsx` - Plan+Build+PR orchestrator (~300 lines). Contains duplicated Plan and Build phase code. Needs workflow docstring standardization, extraction to shared library, and branch sync logic.
- `adws/adwPlanBuildTest.tsx` - Plan+Build+Test+PR orchestrator (~400 lines). Contains duplicated Plan, Build, and Test phase code. Needs workflow docstring standardization, extraction to shared library, and branch sync logic.
- `adws/github/worktreeOperations.ts` - Git worktree management (~460 lines). Needs a new function `mergeDefaultBranchIntoWorktree()` to merge latest changes from origin's default branch into an existing worktree.
- `adws/github/gitOperations.ts` - Contains `checkoutDefaultBranch()` function that must be called before creating new worktrees.
- `adws/github/index.ts` - GitHub module barrel exports. Needs to export the new `mergeDefaultBranchIntoWorktree` function.
- `adws/core/orchestratorLib.ts` - Existing shared orchestrator utilities with `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage`.
- `adws/core/index.ts` - Core module barrel exports. No changes needed (already exports orchestratorLib functions).
- `adws/core/dataTypes.ts` - Data types including `WorkflowStage`, `RecoveryState`, `AgentState`, `AgentIdentifier`.
- `adws/agents/index.ts` - Agent module exports including `runPlanAgent`, `runBuildAgent`, `runUnitTestsWithRetry`, `runE2ETestsWithRetry`.
- `adws/index.ts` - Root barrel export. Needs to export new `workflowPhases` functions.

### New Files
- `adws/workflowPhases.ts` - New shared library containing composable workflow phase functions extracted from the three orchestrators. Located at the `adws/` level (not in `core/`) because it imports from `agents/`, `github/`, `triggers/`, and `core/`, making it a higher-level composition module that sits above all of those.
- `adws/__tests__/workflowPhases.test.ts` - Unit tests for the new shared workflow phase functions and the new `mergeDefaultBranchIntoWorktree` function.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `mergeDefaultBranchIntoWorktree()` to `adws/github/worktreeOperations.ts`
- Add a new exported function at the end of the file:
  ```typescript
  export function mergeDefaultBranchIntoWorktree(worktreePath: string, defaultBranch: string): void
  ```
- This function should:
  - Run `git fetch origin` in the worktree directory (`{ stdio: 'pipe', cwd: worktreePath }`) to get the latest remote changes
  - Run `git merge origin/${defaultBranch}` in the worktree directory to merge the latest default branch changes into the current branch
  - Log appropriate messages using `log()` for fetch and merge operations
  - Throw an error if the merge fails (e.g., merge conflicts), with a descriptive message including the worktree path and branch name
- Update `adws/github/index.ts` to add `mergeDefaultBranchIntoWorktree` to the Worktree Operations export block

### Step 2: Create `adws/workflowPhases.ts` - Shared Workflow Phase Functions
- Define a `WorkflowConfig` interface to hold common workflow state passed between phases:
  ```typescript
  export interface WorkflowConfig {
    issueNumber: number;
    adwId: string;
    issue: GitHubIssue;
    issueType: IssueClassSlashCommand;
    worktreePath: string;
    defaultBranch: string;
    logsDir: string;
    orchestratorStatePath: string;
    orchestratorName: AgentIdentifier;
    recoveryState: RecoveryState;
    ctx: WorkflowContext;
  }
  ```
- Implement and export the following composable phase functions. Each function encapsulates the exact workflow step logic currently duplicated across the three orchestrators.

#### `initializeWorkflow()`
- Signature: `async function initializeWorkflow(issueNumber: number, adwId: string, orchestratorName: AgentIdentifier, options?: { cwd?: string; issueType?: IssueClassSlashCommand }): Promise<WorkflowConfig>`
- Steps:
  1. Log the orchestrator banner (name, issue number, ADW ID)
  2. Fetch issue using `fetchGitHubIssue(issueNumber)`
  3. Classify issue: if `options.issueType` is provided, use it directly and log it; otherwise call `classifyGitHubIssue(issue)` and extract `issueType`
  4. Setup worktree with branch synchronization (**addresses Comment 3**):
     - If `options.cwd` is provided, use it directly as `worktreePath`. Get `defaultBranch` via `getDefaultBranch()`. Then merge latest from default branch into the provided worktree using `mergeDefaultBranchIntoWorktree(cwd, defaultBranch)`.
     - If no `cwd`:
       - Get `defaultBranch` via `getDefaultBranch()`
       - Generate `branchName` via `generateBranchName(issueNumber, issue.title, issueType)`
       - Check if worktree already exists using `getWorktreeForBranch(branchName)` from `./github`
       - If worktree does **NOT** exist: call `checkoutDefaultBranch()` first to pull latest into main repo, then call `ensureWorktree(branchName, defaultBranch)` to create the worktree from the updated default branch
       - If worktree **DOES** exist: call `ensureWorktree(branchName, defaultBranch)` (returns existing path), then call `mergeDefaultBranchIntoWorktree(worktreePath, defaultBranch)` to merge latest changes
  5. Initialize logs directory via `ensureLogsDirectory(adwId)`
  6. Initialize orchestrator state via `AgentStateManager.initializeState(adwId, orchestratorName)` and write initial state with `adwId`, `issueNumber`, `agentName: orchestratorName`, and running execution state
  7. Detect recovery state via `detectRecoveryState(issue.comments)`
  8. Create `WorkflowContext` object with `issueNumber`, `adwId`, `issueType`
  9. Handle recovery mode: if `recoveryState.canResume && recoveryState.lastCompletedStage`, log recovery info, check `hasUncommittedChanges(worktreePath)`, restore `branchName`/`planPath`/`prUrl` from recovery state into `ctx`, compute next stage via `getNextStage()`, set `ctx.resumeFrom`, post `'resuming'` workflow comment. Otherwise post `'starting'` comment.
  10. Return the assembled `WorkflowConfig`

#### `executePlanPhase()`
- Signature: `async function executePlanPhase(config: WorkflowConfig): Promise<{ costUsd: number }>`
- Extract the Plan phase code that is nearly identical across all three orchestrators:
  1. **Classify stage**: If `shouldExecuteStage('classified', config.recoveryState)`, write issueClass to orchestrator state, append log, set `config.ctx.issueType`, post `'classified'` comment. Otherwise log skip.
  2. **Branch creation stage**: If `shouldExecuteStage('branch_created', config.recoveryState)`, call `createFeatureBranch(config.issueNumber, config.issue.title, config.issueType, config.worktreePath)`, update `config.ctx.branchName`, write branchName to state, append log, post `'branch_created'` comment. Otherwise if recovery has branchName, call `createFeatureBranch()` to ensure checkout, update `config.ctx.branchName`.
  3. **Plan agent stage**: Get `planPath` via `getPlanFilePath(config.issueNumber)`, set `config.ctx.planPath`. If `shouldExecuteStage('plan_created', config.recoveryState) && !planFileExists(config.issueNumber)`, post `'plan_building'` comment, initialize plan-agent sub-state via `AgentStateManager.initializeState(config.adwId, 'plan-agent', config.orchestratorStatePath)`, write plan agent initial state (with `parentAgent: config.orchestratorName`), call `runPlanAgent()`, handle failure (update agent state, throw error), on success update plan agent state, update orchestrator state, set `config.ctx.planOutput`, post `'plan_created'` comment. Otherwise log skip.
  4. **Plan commit stage**: If `shouldExecuteStage('plan_committing', config.recoveryState)`, post `'plan_committing'` comment, call `commitChanges()` with appropriate commit prefix using `commitPrefixMap[config.issueType]`. Otherwise log skip.
- Return `{ costUsd }` with the plan agent cost

#### `executeBuildPhase()`
- Signature: `async function executeBuildPhase(config: WorkflowConfig): Promise<{ costUsd: number }>`
- Extract the Build phase code that is identical in `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`:
  1. **Read plan content**: Read plan file via `fs.readFileSync(getPlanFilePath(config.issueNumber), 'utf-8')`, log success. Throw descriptive error on failure.
  2. **Build agent stage**: If `shouldExecuteStage('implemented', config.recoveryState)`, post `'implementing'` comment, initialize build-agent sub-state, write build agent initial state (with `parentAgent: config.orchestratorName`), set up progress callback that updates `config.ctx.buildProgress` and posts `'build_progress'` comments at 60-second intervals, call `runBuildAgent()`, handle failure (update agent state, throw error), on success update build agent state, append orchestrator log, set `config.ctx.buildOutput`, post `'implemented'` comment. Otherwise log skip.
  3. **Implementation commit stage**: If `shouldExecuteStage('implementation_committing', config.recoveryState)`, post `'implementation_committing'` comment, call `commitChanges()` with appropriate commit prefix. Otherwise log skip.
- Return `{ costUsd }` with the build agent cost

#### `executeTestPhase()`
- Signature: `async function executeTestPhase(config: WorkflowConfig): Promise<{ costUsd: number; unitTestsPassed: boolean; e2eTestsPassed: boolean; totalRetries: number }>`
- Extract the Test phase code from `adwPlanBuildTest.tsx`:
  1. **Unit tests**: Log "Phase: Unit Tests", append to orchestrator log, call `runUnitTestsWithRetry({ logsDir: config.logsDir, orchestratorStatePath: config.orchestratorStatePath, maxRetries: MAX_TEST_RETRY_ATTEMPTS })`. If failed after max retries: log error, append to orchestrator log, set `config.ctx.errorMessage`, post `'error'` workflow comment, update orchestrator state with failed execution and `{ unitTestsPassed: false }` metadata, call `process.exit(1)`.
  2. **E2E tests**: Log "Phase: E2E Tests", append to orchestrator log, call `runE2ETestsWithRetry(...)`. If failed after max retries: same error handling as unit tests but with metadata `{ unitTestsPassed: true, e2eTestsPassed: false }` and `process.exit(1)`.
  3. Log "All tests passed!", append to orchestrator log.
- Return `{ costUsd, unitTestsPassed: true, e2eTestsPassed: true, totalRetries }`

#### `executePRPhase()`
- Signature: `function executePRPhase(config: WorkflowConfig): void`
- Extract the PR phase code that is identical in `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`:
  1. If `shouldExecuteStage('pr_created', config.recoveryState)`, post `'pr_creating'` comment, call `createPullRequest(config.issue, '', '', config.defaultBranch, config.worktreePath)`, set `config.ctx.prUrl`, post `'pr_created'` comment, log PR URL. Otherwise log skip.

#### `completeWorkflow()`
- Signature: `function completeWorkflow(config: WorkflowConfig, totalCostUsd: number, additionalMetadata?: Record<string, unknown>): void`
- Steps:
  1. Update orchestrator state with successful execution via `AgentStateManager.completeExecution()` and metadata (including `totalCostUsd` and spread `additionalMetadata`)
  2. Append completion log to orchestrator state
  3. Post `'completed'` workflow comment
  4. Print completion banner (orchestrator name, PR URL if available)

#### `handleWorkflowError()`
- Signature: `function handleWorkflowError(config: WorkflowConfig, error: unknown): never`
- Steps:
  1. Set `config.ctx.errorMessage = String(error)`
  2. Post `'error'` workflow comment
  3. Update orchestrator state with failed execution via `AgentStateManager.completeExecution()`
  4. Append error log to orchestrator state
  5. Log error message
  6. Call `process.exit(1)`

**Imports for `workflowPhases.ts`**:
- From `./core`: `log`, `ensureLogsDirectory`, `IssueClassSlashCommand`, `commitPrefixMap`, `AgentStateManager`, `AgentState`, `AgentIdentifier`, `RecoveryState`, `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage`, `MAX_TEST_RETRY_ATTEMPTS`
- From `./github`: `fetchGitHubIssue`, `createFeatureBranch`, `commitChanges`, `createPullRequest`, `postWorkflowComment`, `WorkflowContext`, `detectRecoveryState`, `getDefaultBranch`, `generateBranchName`, `ensureWorktree`, `getWorktreeForBranch`, `checkoutDefaultBranch`, `mergeDefaultBranchIntoWorktree`
- From `./agents`: `runPlanAgent`, `getPlanFilePath`, `planFileExists`, `runBuildAgent`, `ProgressCallback`, `ProgressInfo`, `runUnitTestsWithRetry`, `runE2ETestsWithRetry`
- From `./triggers/issueClassifier`: `classifyGitHubIssue`
- From `fs`: `readFileSync`

**Note**: This file will be approximately 300-350 lines. This exceeds the 150-line guideline but is an acceptable exception since it consolidates ALL shared workflow logic from three orchestrators into one cohesive library. Further splitting would create artificial module boundaries.

### Step 3: Update `adws/index.ts` - Export new shared functions
- Add a new export block for the workflow phases module:
  ```typescript
  // Workflow Phases - Composable orchestrator phase functions
  export {
    type WorkflowConfig,
    initializeWorkflow,
    executePlanPhase,
    executeBuildPhase,
    executeTestPhase,
    executePRPhase,
    completeWorkflow,
    handleWorkflowError,
  } from './workflowPhases';
  ```

### Step 4: Refactor `adws/adwPlan.tsx` - Use shared phases + consistent workflow docstring
- **Update the workflow docstring** (lines 6-13) to use the standardized format. The Plan workflow is the base that others extend:
  ```
  * Workflow:
  * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
  * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
  * 3. Finalize: update state, post completion comment
  ```
- **Keep** `printUsageAndExit()` and `parseArguments()` as they are (unique CLI with `--cwd` and `--issue-type` options specific to this orchestrator)
- **Refactor the `main()` function** to use shared workflow phases:
  ```typescript
  async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const { issueNumber, providedAdwId, cwd, providedIssueType } = parseArguments(args);
    const adwId = providedAdwId || generateAdwId();

    const config = await initializeWorkflow(issueNumber, adwId, 'plan-orchestrator', {
      cwd: cwd || undefined,
      issueType: providedIssueType || undefined,
    });

    try {
      const planResult = await executePlanPhase(config);
      completeWorkflow(config, planResult.costUsd);
    } catch (error) {
      handleWorkflowError(config, error);
    }
  }
  ```
- **Remove** all inline workflow step code that is now in `workflowPhases.ts`:
  - Remove the entire Plan phase implementation from `main()` (classify, branch, plan agent, commit)
  - Remove setup code (fetch issue, worktree, state init, recovery) now handled by `initializeWorkflow()`
  - Remove `printPlanSummary()` function (replaced by `completeWorkflow()`)
  - Remove error handling code (replaced by `handleWorkflowError()`)
- **Update imports**: Remove all unused imports from `./core`, `./github`, `./agents`, `./triggers/issueClassifier`. Add `initializeWorkflow`, `executePlanPhase`, `completeWorkflow`, `handleWorkflowError` from `./workflowPhases`. Keep `generateAdwId` from `./core` (needed for `providedAdwId || generateAdwId()`).
- **Target file size**: ~60-80 lines (down from ~300)

### Step 5: Refactor `adws/adwPlanBuild.tsx` - Use shared phases + consistent workflow docstring
- **Update the workflow docstring** to use the standardized format, extending the Plan workflow with identical wording for shared steps:
  ```
  * Workflow:
  * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
  * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
  * 3. Build Phase: run build agent, commit implementation
  * 4. PR Phase: create pull request
  * 5. Finalize: update state, post completion comment
  ```
- **Keep** `printUsageAndExit()` and `parseArguments()` (unique to this orchestrator's simpler CLI)
- **Refactor the `main()` function** to use shared workflow phases:
  ```typescript
  async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const { issueNumber, adwId } = parseArguments(args);

    const config = await initializeWorkflow(issueNumber, adwId, 'plan-build-orchestrator');

    try {
      const planResult = await executePlanPhase(config);
      const buildResult = await executeBuildPhase(config);
      executePRPhase(config);
      completeWorkflow(config, planResult.costUsd + buildResult.costUsd);
    } catch (error) {
      handleWorkflowError(config, error);
    }
  }
  ```
- **Remove** all inline workflow step code. Remove `import * as fs from 'fs'` (no longer needed directly).
- **Update imports**: Remove all unused imports from `./core`, `./github`, `./agents`, `./triggers/issueClassifier`. Add `initializeWorkflow`, `executePlanPhase`, `executeBuildPhase`, `executePRPhase`, `completeWorkflow`, `handleWorkflowError` from `./workflowPhases`. Keep `generateAdwId` from `./core`.
- **Target file size**: ~60-70 lines (down from ~300)

### Step 6: Refactor `adws/adwPlanBuildTest.tsx` - Use shared phases + consistent workflow docstring
- **Update the workflow docstring** to use the standardized format, extending the Plan+Build workflow with identical wording for shared steps:
  ```
  * Workflow:
  * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
  * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
  * 3. Build Phase: run build agent, commit implementation
  * 4. Test Phase: run unit tests with retry, run E2E tests with retry
  * 5. PR Phase: create pull request (only if all tests pass)
  * 6. Finalize: update state, post completion comment
  ```
- **Keep** `printUsageAndExit()` and `parseArguments()` (unique to this orchestrator's CLI)
- **Refactor the `main()` function** to use shared workflow phases:
  ```typescript
  async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const { issueNumber, adwId } = parseArguments(args);

    const config = await initializeWorkflow(issueNumber, adwId, 'plan-build-test-orchestrator');

    try {
      const planResult = await executePlanPhase(config);
      const buildResult = await executeBuildPhase(config);
      const testResult = await executeTestPhase(config);
      executePRPhase(config);
      completeWorkflow(config, planResult.costUsd + buildResult.costUsd + testResult.costUsd, {
        unitTestsPassed: testResult.unitTestsPassed,
        e2eTestsPassed: testResult.e2eTestsPassed,
        totalTestRetries: testResult.totalRetries,
      });
    } catch (error) {
      handleWorkflowError(config, error);
    }
  }
  ```
- **Remove** all inline workflow step code. Remove `import * as fs from 'fs'` (no longer needed directly).
- **Update imports**: Remove all unused imports. Add `initializeWorkflow`, `executePlanPhase`, `executeBuildPhase`, `executeTestPhase`, `executePRPhase`, `completeWorkflow`, `handleWorkflowError` from `./workflowPhases`. Keep `generateAdwId` from `./core`.
- **Target file size**: ~70-80 lines (down from ~400)

### Step 7: Create `adws/__tests__/workflowPhases.test.ts` - Unit tests
- Follow existing test patterns from `adws/__tests__/orchestratorLib.test.ts` (vitest, `vi.mock`, `vi.mocked`).
- Mock all external dependencies (`child_process`, `fs`, agent functions, github functions, `AgentStateManager`, `classifyGitHubIssue`).

- **Test `mergeDefaultBranchIntoWorktree()`**:
  - Mock `execSync` to test successful fetch and merge
  - Test that `git fetch origin` is called with the correct `cwd`
  - Test that `git merge origin/{defaultBranch}` is called with the correct `cwd`
  - Test error handling when merge fails (throws descriptive error)

- **Test `initializeWorkflow()`**:
  - Test that `checkoutDefaultBranch()` is called before `ensureWorktree()` when worktree does NOT exist (verifying Comment 3 behavior)
  - Test that `mergeDefaultBranchIntoWorktree()` is called when worktree already exists (verifying Comment 3 behavior)
  - Test that provided `cwd` is used directly with merge of latest changes
  - Test that provided `issueType` skips classification
  - Test recovery mode: when `recoveryState.canResume` is true, context fields are restored and `'resuming'` comment is posted
  - Test normal mode: when no recovery, `'starting'` comment is posted

- **Test `executePlanPhase()`**:
  - Test that all plan stages execute when no recovery state
  - Test that stages are skipped when already completed (recovery mode)
  - Test that plan agent failure throws an error

- **Test `executeBuildPhase()`**:
  - Test plan content is read from file
  - Test that build agent is called with progress callback
  - Test that build agent failure throws an error
  - Test that missing plan file throws descriptive error

- **Test `executePRPhase()`**:
  - Test PR is created when stage should execute
  - Test PR is skipped when already completed

- **Test `completeWorkflow()`**:
  - Writes completion state with metadata, posts `'completed'` comment

- **Test `handleWorkflowError()`**:
  - Posts error comment, updates failure state, calls `process.exit(1)`

### Step 8: Run validation commands
- Execute `npm run lint` to check for code quality issues
- Execute `npm run build` to verify no build errors
- Execute `npm test` to validate zero regressions, including the new tests

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `WorkflowConfig` interface is the key abstraction. `initializeWorkflow()` assembles it once (fetching issue, classifying, setting up worktree, initializing state) and all subsequent phase functions receive it. This avoids each function needing 8+ individual parameters and keeps the orchestrator `main()` functions clean.
- The `workflowPhases.ts` file will be approximately 300-350 lines, exceeding the 150-line guideline. This is an acceptable exception since: (a) it consolidates genuinely shared logic from three files, (b) splitting it further into `planPhase.ts` + `buildPhase.ts` + `testPhase.ts` would create artificial module boundaries since all phases share the same `WorkflowConfig` type and import patterns, and (c) the alternative is ~200+ lines of duplication across each orchestrator.
- After this refactoring, each orchestrator file becomes ~60-80 lines (down from 300-400), containing only argument parsing, the `main()` composition function, and `printUsageAndExit()`. The relationship between orchestrators becomes immediately clear from their `main()` function: they differ only in which phases they compose.
- The `adwPlan.tsx` orchestrator retains its unique `--cwd` and `--issue-type` CLI options since it can be invoked with a pre-existing worktree path. The `initializeWorkflow()` function accepts these as optional parameters via the `options` object.
- The `handleWorkflowError()` function calls `process.exit(1)` with return type `never`. This matches the current error handling pattern in all three orchestrators.
- The `mergeDefaultBranchIntoWorktree()` function handles merge conflicts by throwing an error, which propagates to `handleWorkflowError()` which posts the appropriate workflow comment to the GitHub issue.
- The `WorkflowConfig.ctx` object is passed by reference and mutated in place by phase functions (e.g., setting `branchName`, `planPath`, `prUrl`, `buildProgress`). This matches the existing codebase pattern where `ctx` is mutated throughout the workflow.
- The `executePlanPhase` function handles the case where `config.issueType` was already set during `initializeWorkflow()` (via `options.issueType`). The classify stage simply posts the comment without re-classifying, consistent with the current `adwPlan.tsx` behavior for pre-classified issues.
- The file is placed at `adws/workflowPhases.ts` (not in `core/`) because it imports from `agents/`, `github/`, `triggers/`, and `core/`. Placing it in `core/` would create upward dependencies from a lower-level module to higher-level ones.
