# Chore: ADW Recovery from GitHub Comments

## Chore Description
The ADW (AI Developer Workflow) process occasionally gets stuck during execution. When this happens, there is no way to recover and the workflow must be restarted from the beginning, wasting time and API costs. This chore implements a recovery mechanism that allows the ADW process to continue from where it last left off by parsing the GitHub comments that were left by the previous process.

The ADW workflow already posts detailed progress comments to GitHub issues at each stage (via `workflowComments.ts`). This chore leverages these existing comments to detect the last completed stage and resume the workflow from that point.

## Relevant Files
Use these files to resolve the chore:

- **`adws/adwPlanBuild.tsx`** - Main orchestrator file that runs the ADW workflow. Needs to be updated to check for existing comments at startup and skip completed stages when resuming.

- **`adws/workflowComments.ts`** - Contains workflow comment formatting functions. Will be extended with functions to parse comments and detect workflow stages.

- **`adws/dataTypes.ts`** - Contains TypeScript type definitions including `WorkflowStage` and `WorkflowContext`. May need new types for recovery state.

- **`adws/githubApi.ts`** - Contains GitHub API functions including `fetchGitHubIssue` which already fetches issue comments. This provides the comments needed for recovery detection.

- **`adws/gitOperations.ts`** - Contains git operations. The `createFeatureBranch` function already handles existing branches by checking them out instead of creating new ones, which supports recovery.

- **`adws/planAgent.ts`** - Contains the Plan Agent. Needs to check if plan file already exists when resuming.

- **`adws/utils.ts`** - Contains utility functions. No changes needed.

- **`adws/config.ts`** - Contains configuration. No changes needed.

### New Files
No new files are required. All recovery logic will be added to existing modules to maintain modularity.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add Recovery Types to dataTypes.ts
- Add a `RecoveryState` interface to `adws/dataTypes.ts` with fields:
  - `lastCompletedStage: WorkflowStage | null` - The last successfully completed stage
  - `adwId: string | null` - The ADW ID from the previous run (extracted from comments)
  - `branchName: string | null` - The branch name from previous run
  - `planPath: string | null` - The plan file path from previous run
  - `prUrl: string | null` - The PR URL if already created
  - `canResume: boolean` - Whether recovery is possible

### Step 2: Add Comment Parsing Functions to workflowComments.ts
- Add a function `parseWorkflowStageFromComment(commentBody: string): WorkflowStage | null` that:
  - Checks if the comment is an ADW workflow comment (starts with `## :` and contains `ADW ID:`)
  - Extracts the workflow stage from the comment header (e.g., `:rocket: ADW Workflow Started` → `starting`)
  - Returns `null` if the comment is not a workflow comment

- Add a function `extractAdwIdFromComment(commentBody: string): string | null` that:
  - Uses regex to extract the ADW ID from comment body (pattern: `` `adw-{timestamp}-{random}` ``)
  - Returns `null` if no ADW ID is found

- Add a function `extractBranchNameFromComment(commentBody: string): string | null` that:
  - Uses regex to extract branch name from comment body (pattern: `` `feature/issue-{number}-{slug}` ``)
  - Returns `null` if no branch name is found

- Add a function `extractPrUrlFromComment(commentBody: string): string | null` that:
  - Uses regex to extract PR URL from comment body
  - Returns `null` if no PR URL is found

### Step 3: Add Recovery Detection Function to workflowComments.ts
- Add a function `detectRecoveryState(comments: GitHubComment[]): RecoveryState` that:
  - Filters comments to only ADW workflow comments (using `parseWorkflowStageFromComment`)
  - Sorts comments by `createdAt` in descending order (most recent first)
  - Checks if the most recent ADW comment indicates an error or incomplete state
  - Determines the last successfully completed stage
  - Extracts context (adwId, branchName, planPath, prUrl) from relevant comments
  - Returns a `RecoveryState` object with all extracted information

- Define the stage completion order for determining resume point:
  ```typescript
  const STAGE_ORDER: WorkflowStage[] = [
    'starting',
    'classified',
    'branch_created',
    'plan_building',
    'plan_created',
    'plan_committing',
    'implementing',
    'implemented',
    'implementation_committing',
    'pr_creating',
    'pr_created',
    'completed'
  ];
  ```

### Step 4: Add Plan File Existence Check to planAgent.ts
- Add a function `planFileExists(issueNumber: number): boolean` that:
  - Checks if the plan file exists at `specs/issue-{issueNumber}-plan.md`
  - Returns `true` if the file exists and has content, `false` otherwise

- Export this function from `planAgent.ts`

### Step 5: Update Main Orchestrator for Recovery Support
- Update `adws/adwPlanBuild.tsx` to:
  - Import the new recovery functions from `workflowComments.ts`
  - After fetching the GitHub issue, call `detectRecoveryState(issue.comments)`
  - If `canResume` is true:
    - Log that recovery mode is active with the last completed stage
    - Post a "Resuming workflow" comment to the issue
    - Use the extracted `adwId` instead of generating a new one
    - Skip stages that are already completed based on `lastCompletedStage`
  - Implement conditional execution for each stage:
    - Skip classification if already classified (`lastCompletedStage >= 'classified'`)
    - Skip branch creation if already created (`lastCompletedStage >= 'branch_created'`)
    - Skip plan agent if plan already exists (`lastCompletedStage >= 'plan_created'` or plan file exists)
    - Skip plan commit if already committed (`lastCompletedStage >= 'plan_committing'`)
    - Continue with build agent if implementation not complete
    - Skip implementation commit if already committed
    - Skip PR creation if PR already exists

### Step 6: Add Resuming Workflow Comment
- Add a new workflow stage `'resuming'` to the `WorkflowStage` type in `dataTypes.ts`
- Add a `formatResumingComment(ctx: WorkflowContext, resumeFrom: WorkflowStage): string` function in `workflowComments.ts` that:
  - Indicates the workflow is resuming
  - Shows the ADW ID being resumed
  - Shows the stage it's resuming from
  - Example format:
    ```
    ## :arrows_counterclockwise: ADW Workflow Resuming

    Resuming automated development workflow from previous run.

    **Resuming from:** {stage}
    **ADW ID:** `{adwId}`
    ```

### Step 7: Update Stage Execution Logic
- Refactor the main workflow in `adwPlanBuild.tsx` to use a function-based approach:
  - Create a `shouldExecuteStage(stage: WorkflowStage, recoveryState: RecoveryState): boolean` helper
  - This function returns `false` if the stage has already been completed in a previous run
  - Wrap each stage execution in a conditional check using this helper

- For each stage, add the conditional logic:
  ```typescript
  // Example for Plan Agent stage
  if (shouldExecuteStage('plan_building', recoveryState)) {
    postWorkflowComment(issueNumber, 'plan_building', ctx);
    log('Running Plan Agent...', 'info');
    const planResult = await runPlanAgent(issue, logsDir, issueType);
    // ... rest of plan agent logic
  } else {
    log('Skipping Plan Agent (already completed)', 'info');
    // Load existing plan path from recovery state
    ctx.planPath = recoveryState.planPath || getPlanFilePath(issueNumber);
  }
  ```

### Step 8: Handle Edge Cases
- Handle the case where the branch exists but no commits were made yet
- Handle the case where the plan file was created but not committed
- Handle the case where implementation was started but not completed
- Ensure git status is clean before resuming (warn if there are uncommitted changes)
- Handle the case where a different ADW ID is running on the same issue

### Step 9: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the chore is complete with zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- **Idempotency**: Each stage should be idempotent - running it twice should not cause problems. The git operations already handle this (branch checkout if exists, no commit if no changes).

- **Comment Detection Reliability**: The comment parsing relies on the specific format of workflow comments. If the format changes in `workflowComments.ts`, the parsing functions must be updated accordingly.

- **Multiple ADW Runs**: If multiple ADW processes have run on the same issue (e.g., after manual restarts), the recovery logic uses the most recent ADW run. Consider adding logic to warn if comments from different ADW IDs are detected.

- **Error Recovery**: When an error stage is detected, the recovery should attempt to resume from the last successful stage before the error, not from the error itself.

- **Stage Dependencies**: Some stages depend on outputs from previous stages (e.g., Build Agent needs the plan file). The recovery logic must ensure these dependencies are satisfied either from the filesystem or from extracted comment data.

- **Log Continuity**: When resuming, logs should be appended to the existing log directory if the ADW ID is being reused, or a new directory created if a new ADW ID is generated.

- **Git State**: Before resuming, verify the git state matches expectations (correct branch checked out, no conflicting uncommitted changes). If state is inconsistent, warn the user rather than proceeding.

- **Testing Recovery**: To test recovery manually:
  1. Start an ADW workflow on an issue
  2. Kill the process mid-execution (after some comments are posted)
  3. Restart the ADW workflow with the same issue number
  4. Verify it detects the previous run and resumes from the correct stage
