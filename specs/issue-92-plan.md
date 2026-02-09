# Chore: Streamline orchestrator ADWs

## Chore Description
The three ADW orchestrators (`adwPlan`, `adwPlanBuild`, `adwPlanBuildTest`) have increasing functionalities but are structured very inconsistently. `adwPlanBuild` and `adwPlanBuildTest` currently shell out to other orchestrators as subprocesses, which violates the principle that orchestrators must not reference one another. Additionally, duplicated utility functions exist across files, classification approaches differ, and state management / recovery support is inconsistent. This chore refactors all three orchestrators to be completely self-sufficient, using composition via shared library functions. No orchestrator may reference another orchestrator in any way.

### Current Problems
1. **Cross-orchestrator references**: `adwPlanBuild.tsx` calls `adwPlan.tsx` and `adwBuild.tsx` as subprocesses; `adwPlanBuildTest.tsx` calls `adwPlan.tsx`, `adwBuild.tsx`, and `adwTest.tsx` as subprocesses.
2. **Duplicated utility functions**: `shouldExecuteStage()`, `hasUncommittedChanges()`, `getNextStage()` are duplicated in `adwPlan.tsx` and `adwBuild.tsx`. `runSubprocess()`, `parseArguments()`, `printUsageAndExit()` are duplicated in `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`.
3. **Inconsistent classification**: `adwPlan.tsx` has an inline `classifyIssue()` function using `runClaudeAgentWithCommand` directly with state tracking, while `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` use `classifyGitHubIssue()` from `triggers/issueClassifier.ts`.
4. **Inconsistent state management**: `adwPlan.tsx` and `adwBuild.tsx` use full `AgentStateManager` tracking; `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` have zero state management.
5. **Inconsistent recovery support**: `adwPlan.tsx` and `adwBuild.tsx` support recovery from GitHub comments; `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` do not.
6. **Inconsistent workflow comments**: `adwPlan.tsx` posts detailed workflow comments at each stage; `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` only post comments at PR creation/completion/error.

## Relevant Files
Use these files to resolve the chore:

### Existing Files to Modify
- `adws/adwPlan.tsx` - Plan-only orchestrator (493 lines). Needs refactoring to: remove inline `classifyIssue()` (use `classifyGitHubIssue` from `issueClassifier.ts` instead), import `shouldExecuteStage`/`hasUncommittedChanges`/`getNextStage` from new shared library, create its own worktree when not provided via `--cwd`.
- `adws/adwBuild.tsx` - Build-only phase script (385 lines). Needs refactoring to: import `shouldExecuteStage`/`hasUncommittedChanges`/`getNextStage` from new shared library instead of defining them inline.
- `adws/adwPlanBuild.tsx` - Plan+Build orchestrator (179 lines). Needs complete rewrite to: stop shelling out to `adwPlan.tsx` and `adwBuild.tsx`, implement all phases inline using library functions, add proper state management and recovery support, add workflow comments at each stage.
- `adws/adwPlanBuildTest.tsx` - Plan+Build+Test orchestrator (200 lines). Needs complete rewrite to: stop shelling out to `adwPlan.tsx`, `adwBuild.tsx`, and `adwTest.tsx`, implement all phases inline using library functions, add proper state management and recovery support, add workflow comments at each stage.
- `adws/core/dataTypes.ts` - Data types file. Needs `AgentIdentifier` type updated to include `'plan-build-orchestrator'` and `'plan-build-test-orchestrator'`.
- `adws/core/index.ts` - Core module barrel export. Needs to re-export new `orchestratorLib` functions.
- `adws/index.ts` - Root barrel export. Needs to re-export new `orchestratorLib` functions.

### New Files
- `adws/core/orchestratorLib.ts` - New shared library for orchestrator utility functions: `shouldExecuteStage()`, `hasUncommittedChanges()`, `getNextStage()`.
- `adws/__tests__/orchestratorLib.test.ts` - Unit tests for the new shared library functions.

### Reference Files (read-only, do not modify)
- `adws/agents/index.ts` - Agent module exports (`runPlanAgent`, `runBuildAgent`, `runUnitTestsWithRetry`, `runE2ETestsWithRetry`, etc.).
- `adws/agents/planAgent.ts` - Plan agent functions (`runPlanAgent`, `getPlanFilePath`, `planFileExists`).
- `adws/agents/buildAgent.ts` - Build agent functions (`runBuildAgent`).
- `adws/agents/testRetry.ts` - Test retry logic (`runUnitTestsWithRetry`, `runE2ETestsWithRetry`).
- `adws/github/index.ts` - GitHub module exports.
- `adws/github/workflowCommentsBase.ts` - `STAGE_ORDER`, recovery state detection.
- `adws/github/workflowCommentsIssue.ts` - `WorkflowContext`, `postWorkflowComment`.
- `adws/triggers/issueClassifier.ts` - `classifyGitHubIssue()` function used for classification.
- `adws/core/config.ts` - Configuration constants.
- `adws/core/utils.ts` - Utility functions (`generateAdwId`, `ensureLogsDirectory`, etc.).
- `adws/core/agentState.ts` - `AgentStateManager`.
- `adws/adwTest.tsx` - Test-only phase script (reference for test phase logic).
- `guidelines/coding_guidelines.md` - Coding guidelines that must be followed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create `adws/core/orchestratorLib.ts` - Shared Orchestrator Library
- Create the file `adws/core/orchestratorLib.ts`.
- Extract the following duplicated functions into this new module:
  - `shouldExecuteStage(stage: WorkflowStage, recoveryState: RecoveryState): boolean` - Determines if a stage should be executed based on recovery state. Currently duplicated identically in `adwPlan.tsx` (line 113) and `adwBuild.tsx` (line 59).
  - `hasUncommittedChanges(cwd?: string): boolean` - Checks if there are uncommitted changes in the working directory. Currently duplicated in `adwPlan.tsx` (line 127) and `adwBuild.tsx` (line 73). Update to accept an optional `cwd` parameter passed to `execSync`.
  - `getNextStage(lastCompletedStage: WorkflowStage): WorkflowStage` - Gets the next stage to resume from. Currently duplicated identically in `adwPlan.tsx` (line 139) and `adwBuild.tsx` (line 85).
- Import `WorkflowStage`, `RecoveryState` from `../core/dataTypes` and `STAGE_ORDER` from `../github/workflowCommentsBase`.
- Export all three functions.
- Keep the file focused and under 60 lines.

### Step 2: Update `adws/core/dataTypes.ts` - Add New Agent Identifiers
- Add `'plan-build-orchestrator'` and `'plan-build-test-orchestrator'` to the `AgentIdentifier` type union (around line 305).
- These identifiers will be used by the refactored `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` for their state management.

### Step 3: Update `adws/core/index.ts` - Export Shared Library
- Add export for the new orchestratorLib module functions: `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage`.
- Add them under a new comment section "Orchestrator shared utilities".

### Step 4: Refactor `adws/adwPlan.tsx` - Use Shared Utilities and Standardize Classification
- **Remove the inline `classifyIssue()` function** (lines 62-108). Replace with `classifyGitHubIssue()` from `./triggers/issueClassifier`.
- **Remove the inline `shouldExecuteStage()` function** (lines 113-122). Import from `./core`.
- **Remove the inline `hasUncommittedChanges()` function** (lines 127-134). Import from `./core`.
- **Remove the inline `getNextStage()` function** (lines 139-145). Import from `./core`.
- **Update the classification step** (Step 5 in main, around line 328): Replace the call to inline `classifyIssue()` with `classifyGitHubIssue(issue)`. This means:
  - Remove the classifier sub-agent state tracking (lines 341-364) since `classifyGitHubIssue` handles its own execution.
  - The classifier state tracking for the parent orchestrator (line 363) should remain: `AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType })`.
  - Map `classificationResult.issueType` to `issueType` and use `classificationResult.success` for logging.
- **Update imports**: Remove `runClaudeAgentWithCommand` from `./agents` import (no longer needed). Add `classifyGitHubIssue` from `./triggers/issueClassifier`. Add `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage` from `./core`.
- **Ensure worktree creation**: When `--cwd` is NOT provided, `adwPlan.tsx` should create a worktree using `ensureWorktree()` from `./github` (similar to how `adwPlanBuild.tsx` currently does it), so that the plan phase always runs in an isolated worktree. If `--cwd` IS provided, use the provided path as before.
- Keep `printUsageAndExit()`, `parseArguments()`, and `printPlanSummary()` as they are (specific to this orchestrator's CLI).

### Step 5: Refactor `adws/adwBuild.tsx` - Use Shared Utilities
- **Remove the inline `shouldExecuteStage()` function** (lines 59-68). Import from `./core`.
- **Remove the inline `hasUncommittedChanges()` function** (lines 73-80). Import from `./core`.
- **Remove the inline `getNextStage()` function** (lines 85-91). Import from `./core`.
- **Update imports**: Add `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage` from `./core`.
- Keep the rest of the file unchanged (it is already a self-sufficient phase script).

### Step 6: Rewrite `adws/adwPlanBuild.tsx` - Self-Sufficient Plan+Build+PR Orchestrator
- **Remove all subprocess approach**: Delete `runSubprocess()` function and all `execSync` subprocess calls to `adwPlan.tsx` and `adwBuild.tsx`.
- **Implement all phases inline** using the same library functions and structural patterns as `adwPlan.tsx` and `adwBuild.tsx`.
- The orchestrator must follow this workflow:
  1. **Parse arguments**: Keep `<issue-number> [adw-id]` CLI signature.
  2. **Print banner**: Log orchestrator name, issue number, ADW ID.
  3. **Fetch issue**: Use `fetchGitHubIssue(issueNumber)` from `./github`.
  4. **Classify issue**: Use `classifyGitHubIssue(issue)` from `./triggers/issueClassifier`.
  5. **Setup worktree**: Use `getDefaultBranch()`, `generateBranchName()`, `ensureWorktree()` from `./github`.
  6. **Initialize state**: Use `AgentStateManager.initializeState(adwId, 'plan-build-orchestrator')`. Write initial state with `AgentStateManager.writeState()`.
  7. **Detect recovery state**: Use `detectRecoveryState(issue.comments)` from `./github`.
  8. **Initialize workflow context**: Create `WorkflowContext` object.
  9. **Handle recovery mode**: If `recoveryState.canResume`, log recovery info, call `hasUncommittedChanges()` from `./core`, restore context from recovery, post `'resuming'` comment. Otherwise post `'starting'` comment.
  10. **Plan phase** (matching `adwPlan.tsx` pattern):
      - Classify issue if `shouldExecuteStage('classified', recoveryState)` and not pre-classified. Use `classifyGitHubIssue()`. Update orchestrator state. Post `'classified'` comment.
      - Create branch if `shouldExecuteStage('branch_created', recoveryState)`. Use `createFeatureBranch()`. Update state. Post `'branch_created'` comment.
      - Run plan agent if `shouldExecuteStage('plan_created', recoveryState)` and `!planFileExists()`. Use `runPlanAgent()` from `./agents`. Track plan agent state. Post `'plan_building'` and `'plan_created'` comments.
      - Commit plan if `shouldExecuteStage('plan_committing', recoveryState)`. Use `commitChanges()`. Post `'plan_committing'` comment.
  11. **Build phase** (matching `adwBuild.tsx` pattern):
      - Read plan content from `getPlanFilePath()`.
      - Run build agent if `shouldExecuteStage('implemented', recoveryState)`. Use `runBuildAgent()` from `./agents`. Track build agent state with progress callback. Post `'implementing'` and `'implemented'` comments.
      - Commit implementation if `shouldExecuteStage('implementation_committing', recoveryState)`. Use `commitChanges()`. Post `'implementation_committing'` comment.
  12. **PR phase**:
      - Create PR if `shouldExecuteStage('pr_created', recoveryState)`. Use `createPullRequest()` from `./github`. Post `'pr_creating'` and `'pr_created'` comments.
  13. **Completion**: Update final orchestrator state. Post `'completed'` comment. Print summary.
  14. **Error handling**: Catch errors, post `'error'` comment, update failure state, exit with code 1.
- **Imports**: Use the same library functions as `adwPlan.tsx` and `adwBuild.tsx`:
  - From `./core`: `log`, `generateAdwId`, `ensureLogsDirectory`, `IssueClassSlashCommand`, `commitPrefixMap`, `AgentStateManager`, `AgentState`, `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage`.
  - From `./github`: `fetchGitHubIssue`, `createFeatureBranch`, `commitChanges`, `createPullRequest`, `postWorkflowComment`, `WorkflowContext`, `detectRecoveryState`, `getCurrentBranch`, `getDefaultBranch`, `generateBranchName`, `ensureWorktree`.
  - From `./agents`: `runPlanAgent`, `getPlanFilePath`, `planFileExists`, `runBuildAgent`, `ProgressCallback`, `ProgressInfo`.
  - From `./triggers/issueClassifier`: `classifyGitHubIssue`.
- **Do NOT import from or reference** `adwPlan.tsx`, `adwBuild.tsx`, or any other orchestrator file.

### Step 7: Rewrite `adws/adwPlanBuildTest.tsx` - Self-Sufficient Plan+Build+Test+PR Orchestrator
- Follow the exact same structure as the rewritten `adwPlanBuild.tsx` (Step 6), with these additions:
  - **Test phase** (between Build phase and PR phase, matching `adwTest.tsx` pattern):
    - Run unit tests with retry using `runUnitTestsWithRetry()` from `./agents`. Pass `logsDir`, `orchestratorStatePath`, `MAX_TEST_RETRY_ATTEMPTS`.
    - If unit tests pass, run E2E tests with retry using `runE2ETestsWithRetry()` from `./agents`.
    - If any tests fail after max retries, post error comment, update failure state, exit with code 1.
    - Only proceed to PR phase if all tests pass.
  - **State identifier**: Use `'plan-build-test-orchestrator'` instead of `'plan-build-orchestrator'`.
  - **Additional imports**: `runUnitTestsWithRetry`, `runE2ETestsWithRetry` from `./agents`. `MAX_TEST_RETRY_ATTEMPTS` from `./core`.
  - **Print banner**: Include "Plan, Build & Test" in the banner.
  - **CLI signature**: Keep `<issue-number> [adw-id]`.
- **Do NOT import from or reference** `adwPlan.tsx`, `adwBuild.tsx`, `adwTest.tsx`, or any other orchestrator file.

### Step 8: Update `adws/index.ts` - Export New Shared Functions
- Add exports for `shouldExecuteStage`, `hasUncommittedChanges`, `getNextStage` from `./core`.

### Step 9: Create `adws/__tests__/orchestratorLib.test.ts` - Unit Tests
- Test `shouldExecuteStage()`:
  - Returns `true` when `recoveryState.canResume` is `false`.
  - Returns `true` when `recoveryState.lastCompletedStage` is `null`.
  - Returns `true` when the target stage is after the last completed stage.
  - Returns `false` when the target stage is at or before the last completed stage.
- Test `hasUncommittedChanges()`:
  - Mock `execSync` to return empty string (no changes) -> returns `false`.
  - Mock `execSync` to return non-empty string (has changes) -> returns `true`.
  - Mock `execSync` to throw (git error) -> returns `false`.
  - Test that `cwd` parameter is passed to `execSync` when provided.
- Test `getNextStage()`:
  - Returns the stage after the given stage in `STAGE_ORDER`.
  - Returns `'starting'` when given the last stage.
  - Returns `'starting'` when given an invalid stage.

### Step 10: Run Validation Commands
- Execute all validation commands listed below to confirm zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- **Composition, not inheritance**: Orchestrators compose their behavior from shared library functions (`adws/core/`, `adws/agents/`, `adws/github/`, `adws/triggers/`). They must NEVER import from or reference other orchestrator files (`adwPlan.tsx`, `adwBuild.tsx`, `adwTest.tsx`, etc.).
- **Self-sufficiency**: Each orchestrator must be runnable independently. `adwPlan.tsx` does Plan only. `adwPlanBuild.tsx` does Plan+Build+PR. `adwPlanBuildTest.tsx` does Plan+Build+Test+PR.
- **Structural consistency**: All three orchestrators should follow the same patterns for argument parsing, state management, recovery detection, workflow comments, and error handling. When reading the code, the plan phase in `adwPlanBuild.tsx` should look structurally identical to the plan phase in `adwPlan.tsx`.
- **File size**: The coding guidelines recommend files under 150 lines. The rewritten `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` will likely exceed 150 lines due to their multi-phase nature. This is acceptable because further extraction would create artificial abstraction boundaries. However, keep shared utilities in `orchestratorLib.ts` to minimize duplication.
- **Classification standardization**: All orchestrators must use `classifyGitHubIssue()` from `triggers/issueClassifier.ts`. The inline `classifyIssue()` in `adwPlan.tsx` is removed. The classification function in `issueClassifier.ts` does not track sub-agent state (unlike the removed inline version), which simplifies the code while maintaining the same functionality.
- **`adwBuild.tsx` and `adwTest.tsx` remain standalone phase scripts**: They are NOT orchestrators in the same sense. They remain unchanged in purpose but `adwBuild.tsx` benefits from using shared utility functions.
- **Recovery state**: The rewritten `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` gain recovery support, matching what `adwPlan.tsx` and `adwBuild.tsx` already have. This means if a workflow fails midway, it can be re-run and will resume from the last completed stage.
- **`fs` import**: The rewritten `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx` will need `import * as fs from 'fs'` for reading the plan content (matching `adwBuild.tsx`'s pattern).
