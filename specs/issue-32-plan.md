# Chore: Split adwPlanBuild into adwPlan and adwBuild

## Chore Description
Break up the existing `adwPlanBuild.tsx` script (571 lines) into two focused applications:
- **adwPlan.tsx**: Handles issue classification, branch creation, and plan generation (the `/plan` workflow)
- **adwBuild.tsx**: Handles implementation execution and PR creation (the `/implement` workflow)

Then create a new `adwPlanBuild.tsx` orchestrator that calls these applications in sequence, maintaining the same end-to-end workflow but with cleaner separation of concerns.

## Relevant Files
Use these files to resolve the chore:

- **`adws/adwPlanBuild.tsx`** - The current monolithic script to be refactored. Contains classification, branch creation, plan agent execution, build agent execution, commit logic, and PR creation.
- **`adws/agents/index.ts`** - Exports agent runner functions (runPlanAgent, runBuildAgent, etc.) that will be used by the new scripts.
- **`adws/agents/planAgent.ts`** - Contains `runPlanAgent()` which executes the appropriate planning slash command (/feature, /bug, /chore, /pr_review).
- **`adws/agents/buildAgent.ts`** - Contains `runBuildAgent()` which executes the /implement slash command.
- **`adws/core/index.ts`** - Exports core utilities (log, generateAdwId, ensureLogsDirectory, AgentStateManager, etc.).
- **`adws/github/index.ts`** - Exports GitHub operations (fetchGitHubIssue, createFeatureBranch, commitChanges, createPullRequest, etc.).
- **`guidelines/coding_guidelines.md`** - Coding standards to follow (modular design, file size limits, pure functions, etc.).

### New Files
- **`adws/adwPlan.tsx`** - New standalone script for the planning workflow
- **`adws/adwBuild.tsx`** - New standalone script for the build/implementation workflow

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create adwPlan.tsx - The Planning Application
Create a new `adws/adwPlan.tsx` script that focuses solely on the planning phase:

- Add shebang and JSDoc documentation header explaining usage
- Accept command line arguments: `<github-issue-number> [adw-id]`
- Import required modules from `./core`, `./github`, and `./agents`
- Implement the following workflow stages:
  1. Parse and validate arguments
  2. Fetch the GitHub issue using `fetchGitHubIssue()`
  3. Checkout the default branch and pull latest changes using `checkoutDefaultBranch()`
  4. Detect recovery state from existing comments using `detectRecoveryState()`
  5. Generate or reuse ADW ID using `generateAdwId()` or recovery state
  6. Create logs directory using `ensureLogsDirectory()`
  7. Initialize orchestrator state using `AgentStateManager`
  8. Classify the issue type using the classifier agent (extract `classifyIssue()` function)
  9. Create the feature branch using `createFeatureBranch()`
  10. Run the Plan Agent using `runPlanAgent()`
  11. Commit the plan using `commitChanges()`
  12. Post workflow comments at each stage using `postWorkflowComment()`
- Handle errors and post error comments
- Print a summary on completion with ADW ID, branch name, and plan path
- Exit with appropriate exit code (0 for success, 1 for failure)
- Extract helper functions from current adwPlanBuild.tsx: `classifyIssue()`, `shouldExecuteStage()`, `hasUncommittedChanges()`, `getNextStage()`, `printUsageAndExit()`, `parseArguments()`

### Step 2: Create adwBuild.tsx - The Build Application
Create a new `adws/adwBuild.tsx` script that focuses solely on the implementation phase:

- Add shebang and JSDoc documentation header explaining usage
- Accept command line arguments: `<github-issue-number> [adw-id]`
- Import required modules from `./core`, `./github`, and `./agents`
- Implement the following workflow stages:
  1. Parse and validate arguments
  2. Fetch the GitHub issue using `fetchGitHubIssue()`
  3. Generate or reuse ADW ID (from argument or generate new)
  4. Create logs directory using `ensureLogsDirectory()`
  5. Initialize orchestrator state using `AgentStateManager`
  6. Verify plan file exists using `planFileExists()` and `getPlanFilePath()`
  7. Read the plan content from the specs file
  8. Infer issue type from the current branch using `inferIssueTypeFromBranch()`
  9. Run the Build Agent using `runBuildAgent()` with progress callback
  10. Commit the implementation using `commitChanges()`
  11. Create the Pull Request using `createPullRequest()`
  12. Post workflow comments at each stage using `postWorkflowComment()`
- Handle errors and post error comments
- Print a summary on completion with branch name, PR URL, and cost
- Exit with appropriate exit code (0 for success, 1 for failure)
- Include the `shouldExecuteStage()` and recovery state detection logic for resumable workflows

### Step 3: Refactor adwPlanBuild.tsx as Orchestrator
Replace the current `adwPlanBuild.tsx` with a new orchestrator that calls the two applications in sequence:

- Add shebang and JSDoc documentation header explaining it orchestrates adwPlan and adwBuild
- Accept command line arguments: `<github-issue-number> [adw-id]`
- Import `execSync` from `child_process` for subprocess invocation
- Implement the orchestration workflow:
  1. Parse and validate arguments
  2. Log the start of the combined workflow
  3. Execute `npx tsx adws/adwPlan.tsx <issue-number> [adw-id]` using `execSync`
     - Capture stdout/stderr
     - Check exit code
     - If plan fails, log error and exit with code 1
  4. Execute `npx tsx adws/adwBuild.tsx <issue-number> [adw-id]` using `execSync`
     - Pass the same adw-id to maintain correlation
     - Capture stdout/stderr
     - Check exit code
     - If build fails, log error and exit with code 1
  5. Print a final summary combining outputs from both stages
- Keep the orchestrator simple and focused (under 100 lines)
- Use `stdio: 'inherit'` to stream subprocess output to the terminal in real-time

### Step 4: Update Exports if Needed
Review `adws/index.ts` to ensure any shared types or functions used by both adwPlan and adwBuild are properly exported:

- Verify core utilities are accessible
- Verify agent functions are accessible
- Verify GitHub operations are accessible
- No changes may be needed if imports are done from submodules directly

### Step 5: Run Validation Commands
Execute the validation commands to verify the chore is complete with zero regressions:

- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to run tests and validate zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The current `adwPlanBuild.tsx` is 571 lines, which exceeds the 150-line guideline. Splitting into focused scripts will improve maintainability.
- Both new scripts (`adwPlan.tsx` and `adwBuild.tsx`) should be usable independently, allowing developers to run just the planning phase or just the build phase as needed.
- The ADW ID should be passed between scripts to maintain correlation and enable recovery/resumption of partial workflows.
- Workflow comments posted to GitHub issues should continue to work as before, tracking progress through both phases.
- Recovery state detection allows resuming a failed workflow from where it left off - this functionality must be preserved in both scripts.
- The `printWorkflowSummary()` function from the original can be adapted for each script's specific summary needs.
- Consider extracting shared helper functions (like `shouldExecuteStage()`, `hasUncommittedChanges()`) into a shared module if code duplication becomes excessive, but for now keeping them in each file is acceptable for clarity.
