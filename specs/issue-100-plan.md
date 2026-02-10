# Chore: Extract GitHub branch creation and commit process to skill

## Chore Description
Extract the git branch creation and git commit processes from the ADW orchestrators into Claude Code skills (`.claude/commands/`) and agent wrapper functions. Currently, branch creation (`createFeatureBranch()`, `generateBranchName()`) and commit operations (`commitChanges()`) are called directly as synchronous shell commands scattered across `workflowPhases.ts` and `adwBuild.tsx`. This chore:

1. Copies the attached `commit.md` and `generate_branch_name.md` skill files to `.claude/commands/`.
2. Creates a shared `gitAgent.ts` module in `adws/agents/` that wraps these skills as Claude agent invocations (via `runClaudeAgentWithCommand`).
3. Updates all orchestrator workflows to use the new agent functions instead of direct git operations, ensuring the process works identically in every orchestrator with zero coupling between them.

## Relevant Files
Use these files to resolve the chore:

- **`.claude/commands/implement.md`** - Reference for the `$ARGUMENTS` convention used in existing commands.
- **`.claude/commands/classify_issue.md`** - Reference for command template structure.
- **`adws/agents/claudeAgent.ts`** - Contains `runClaudeAgentWithCommand()` which is the base function for invoking Claude agents with slash commands. The new git agent functions will use this.
- **`adws/agents/planAgent.ts`** - Reference pattern for creating agent wrapper functions (e.g., `formatIssueContextAsArgs`, `runPlanAgent`).
- **`adws/agents/buildAgent.ts`** - Reference pattern for agent wrappers with progress callbacks.
- **`adws/agents/index.ts`** - Barrel exports for the agents module; needs to export new git agent functions.
- **`adws/core/dataTypes.ts`** - Contains `AgentIdentifier`, `SlashCommand`, and `IssueClassSlashCommand` types; needs new agent identifiers.
- **`adws/workflowPhases.ts`** - Contains `initializeWorkflow()`, `executePlanPhase()`, `executeBuildPhase()`, and `completePRReviewWorkflow()` which all currently call direct git operations (`createFeatureBranch`, `commitChanges`). These must be updated to use agent functions.
- **`adws/adwBuild.tsx`** - Standalone build orchestrator that calls `commitChanges()` directly; needs to use the commit agent instead.
- **`adws/adwPrReview.tsx`** - PR review orchestrator that calls `completePRReviewWorkflow()`; needs updating since that function becomes async.
- **`adws/github/gitOperations.ts`** - Contains `createFeatureBranch()`, `commitChanges()`, `generateBranchName()`, etc. These remain as utilities but are no longer called directly by orchestrators for branch creation or commits.
- **`adws/github/worktreeOperations.ts`** - Contains `ensureWorktree()`, `getWorktreeForBranch()`, `getMainRepoPath()`. The worktree setup flow changes because the branch name agent now creates the branch before the worktree is set up.
- **`adws/__tests__/branchNameGeneration.test.ts`** - Existing tests for `generateBranchName()`. These remain valid since the utility function stays.

### New Files
- **`.claude/commands/commit.md`** - Skill file for generating and executing git commits (copied from issue attachment).
- **`.claude/commands/generate_branch_name.md`** - Skill file for generating branch names and creating branches (copied from issue attachment).
- **`adws/agents/gitAgent.ts`** - New agent module containing `runGenerateBranchNameAgent()` and `runCommitAgent()` wrapper functions.
- **`adws/__tests__/gitAgent.test.ts`** - Unit tests for the new git agent functions.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the skill files in `.claude/commands/`

- Copy the attached `generate_branch_name.md` content to `.claude/commands/generate_branch_name.md`.
- Copy the attached `commit.md` content to `.claude/commands/commit.md`.
- Review the skill files and ensure they use `$ARGUMENTS` for receiving input from the agent invocation (consistent with other commands like `/implement`, `/classify_issue`). If the templates use `$1`, `$2`, `$3` positional syntax instead of `$ARGUMENTS`, update them to use `$ARGUMENTS` with a structured format so the agent receives all variables as a single string. The agent will parse the structured input.
- For `generate_branch_name.md`, ensure the `## Variables` section documents the expected inputs: `issue_class`, `adw_id`, and `issue` (JSON).
- For `commit.md`, ensure the `## Variables` section documents the expected inputs: `agent_name`, `issue_class`, and `issue` (JSON).

### Step 2: Update `adws/core/dataTypes.ts` with new agent identifiers

- Add `'branch-name-agent'` and `'commit-agent'` to the `AgentIdentifier` type union.

### Step 3: Create `adws/agents/gitAgent.ts`

- Create the new file `adws/agents/gitAgent.ts` with the following functions:
  - **`formatBranchNameArgs(issueClass: IssueClassSlashCommand, adwId: string, issue: GitHubIssue): string`** — Formats a structured args string for the `/generate_branch_name` skill. The string should clearly label each variable (issue_class, adw_id, issue as JSON) so the agent can parse them.
  - **`extractBranchNameFromOutput(output: string): string`** — Extracts the branch name from the agent's output. The skill returns ONLY the branch name. Handle cases where the output may include extra whitespace or text.
  - **`runGenerateBranchNameAgent(issueType: IssueClassSlashCommand, adwId: string, issue: GitHubIssue, logsDir: string, statePath?: string, cwd?: string): Promise<AgentResult & { branchName: string }>`** — Runs the `/generate_branch_name` slash command via `runClaudeAgentWithCommand()`. Uses `'sonnet'` model for cost efficiency. Extracts and returns the branch name from the agent output. The `cwd` should default to the main repo path (from `getMainRepoPath()`) since the skill operates on the main repository (checkout main, pull, create branch).
  - **`formatCommitArgs(agentName: string, issueClass: string, issueContext: string): string`** — Formats a structured args string for the `/commit` skill. The `issueContext` can be issue JSON, PR details JSON, or any other relevant context string.
  - **`extractCommitMessageFromOutput(output: string): string`** — Extracts the commit message from the agent's output. The skill returns ONLY the commit message.
  - **`runCommitAgent(agentName: string, issueClass: string, issueContext: string, logsDir: string, statePath?: string, cwd?: string): Promise<AgentResult & { commitMessage: string }>`** — Runs the `/commit` slash command via `runClaudeAgentWithCommand()`. Uses `'sonnet'` model for cost efficiency. Extracts and returns the commit message from the agent output. The `cwd` should be the worktree path where the changes exist.
- Follow the existing patterns from `planAgent.ts` and `buildAgent.ts` for function signatures, logging, and error handling.
- Import from `../core` and `./claudeAgent` as needed.

### Step 4: Update `adws/agents/index.ts`

- Add exports for the new git agent functions:
  - `runGenerateBranchNameAgent`
  - `runCommitAgent`
  - Types: `AgentResult` is already exported.

### Step 5: Update `adws/workflowPhases.ts` — `initializeWorkflow()`

- In the `else` branch (no `--cwd` provided), replace the synchronous branch name generation + worktree setup with the agent-based flow:
  - **Before:**
    ```typescript
    const tempBranchName = generateBranchName(issueNumber, issue.title, issueType);
    worktreePath = setupWorktreeWithLatestCode(tempBranchName, defaultBranch);
    ```
  - **After:**
    1. Create `logsDir` earlier (move `ensureLogsDirectory(adwId)` before the worktree setup so the agent can use it for log output).
    2. Run `runGenerateBranchNameAgent(issueType, adwId, issue, logsDir, undefined, getMainRepoPath())` to generate and create the branch in the main repo. The agent does `git checkout main`, `git pull`, and `git checkout -b <branch_name>`.
    3. Extract the branch name from the agent result.
    4. Call `ensureWorktree(branchName)` to create a worktree for the already-existing branch. Since the branch is checked out in the main repo, `createWorktree()` will call `freeBranchFromMainRepo()` to switch the main repo back to the default branch, then create the worktree.
    5. Call `copyEnvToWorktree(worktreePath)` on the new worktree.
  - Remove the `setupWorktreeWithLatestCode` private function if it's no longer needed, or keep it for the recovery/existing-worktree path.
  - Store the branch name in the config so `executePlanPhase()` can use it.
- Add `runGenerateBranchNameAgent` to the imports from `./agents`.
- Add `getMainRepoPath` to the imports from `./github`.

### Step 6: Update `adws/workflowPhases.ts` — `executePlanPhase()`

- In the `branch_created` stage:
  - **Before:** Calls `createFeatureBranch()` to generate the branch name and checkout in the worktree.
  - **After:** The branch was already created during `initializeWorkflow()`. Read the branch name from `config` (it should be stored on `WorkflowConfig` or passed through `ctx`). Just update state and post the workflow comment. No git operations needed.
  - In the recovery path (when `shouldExecuteStage('branch_created', recoveryState)` is false), use the branch name from `recoveryState.branchName` or the config instead of calling `createFeatureBranch()`.
- In the `plan_committing` stage:
  - **Before:** `commitChanges(message, worktreePath)`.
  - **After:** Call `runCommitAgent('plan-orchestrator', issueType, JSON.stringify(issue), logsDir, undefined, worktreePath)`. Extract the commit message from the result.
  - Since `runCommitAgent` is async, this is fine because `executePlanPhase()` is already async.
- Add `runCommitAgent` to the imports from `./agents`.

### Step 7: Update `adws/workflowPhases.ts` — `executeBuildPhase()`

- In the `implementation_committing` stage:
  - **Before:** `commitChanges(message, worktreePath)`.
  - **After:** Call `runCommitAgent('build-agent', issueType, JSON.stringify(issue), logsDir, undefined, worktreePath)`.
  - Already async, so no signature change needed.

### Step 8: Update `adws/workflowPhases.ts` — `completePRReviewWorkflow()`

- Change function signature from sync to async: `export async function completePRReviewWorkflow(config: PRReviewWorkflowConfig): Promise<void>`.
- Replace `commitChanges(commitMsg, worktreePath)` with a call to `runCommitAgent()`:
  - Use `'pr-review-orchestrator'` as the agent name.
  - Use `inferIssueTypeFromBranch(prDetails.headBranch)` to get the issue class (already done).
  - Pass `JSON.stringify(prDetails)` as the issue context.
  - Pass `worktreePath` as the `cwd`.
- Add `logsDir` to `PRReviewWorkflowConfig` interface (it's already present in the config object but not in the interface type — verify and add if needed).

### Step 9: Update `adws/adwBuild.tsx`

- In the commit step (Step 6 in the current code):
  - **Before:** `commitChanges(message, cwd || undefined)`.
  - **After:** Import and call `runCommitAgent('build-orchestrator', issueType, JSON.stringify(issue), logsDir, undefined, cwd || undefined)`.
  - Since `main()` is already async, this is straightforward.
- Add import for `runCommitAgent` from `./agents`.

### Step 10: Update `adws/adwPrReview.tsx`

- Since `completePRReviewWorkflow()` is now async, add `await` before the call:
  - **Before:** `completePRReviewWorkflow(config);`
  - **After:** `await completePRReviewWorkflow(config);`

### Step 11: Add `WorkflowConfig.branchName` field

- Ensure `WorkflowConfig` interface in `workflowPhases.ts` has a `branchName` field (string) to store the branch name generated during initialization, so it can be used in `executePlanPhase()` without needing to re-generate it.
- Set this field in `initializeWorkflow()` after the branch name agent returns.

### Step 12: Create unit tests in `adws/__tests__/gitAgent.test.ts`

- Create tests for:
  - `formatBranchNameArgs()` — verifies the structured args string contains all required fields (issue_class, adw_id, issue JSON).
  - `extractBranchNameFromOutput()` — verifies branch name extraction from clean output, output with whitespace, and output with extra text.
  - `formatCommitArgs()` — verifies the structured args string contains all required fields (agent_name, issue_class, issue context).
  - `extractCommitMessageFromOutput()` — verifies commit message extraction from clean output, output with whitespace, and output with extra text.
- Mock `runClaudeAgentWithCommand` and test `runGenerateBranchNameAgent` and `runCommitAgent` to verify they:
  - Pass the correct slash command (`/generate_branch_name` and `/commit`).
  - Pass correctly formatted args.
  - Use the correct model (`sonnet`).
  - Correctly extract and return branch names / commit messages from agent output.

### Step 13: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to verify all changes pass validation with zero regressions.
- Ensure no unused imports are left behind after refactoring.
- Ensure all existing tests still pass (especially `branchNameGeneration.test.ts`, `gitOperations.test.ts`, `orchestratorLib.test.ts`, `workflowPhases.test.ts`).

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- **Commit message format change:** The commit messages will now be AI-generated by the `/commit` skill agent instead of using template strings. The format changes from `feat: implement #123 - Title` to `<agent_name>: <issue_class>: <concise message>`. This is intentional per the skill template design.
- **Branch name format change:** The branch names will now be AI-generated by the `/generate_branch_name` skill agent instead of using the deterministic `generateBranchName()` function. The format changes from `feature/issue-123-slugified-title` to `<issue_class>-issue-<number>-adw-<adw_id>-<concise-name>`. This is intentional per the skill template design.
- **Backward compatibility:** The existing utility functions (`generateBranchName`, `createFeatureBranch`, `commitChanges`) in `github/gitOperations.ts` should NOT be deleted — they may still be useful as fallbacks or for other purposes. Only the orchestrator call sites change.
- **Cost consideration:** Each branch creation and commit now invokes a Claude agent (sonnet model), which adds API cost. This is a deliberate tradeoff for consistency and AI-powered naming.
- **Worktree integration:** The branch name agent runs in the main repo (not the worktree) because it needs to `git checkout main && git pull && git checkout -b`. After the agent creates the branch, `ensureWorktree()` handles creating the worktree for the existing branch, including freeing the branch from the main repo if needed via `freeBranchFromMainRepo()`.
- **Async changes:** `completePRReviewWorkflow()` becomes async because it now awaits the commit agent. Update all callers accordingly.
- **Template format:** The attached skill files use `$1`, `$2`, `$3` variable notation. Verify whether Claude Code's custom command system supports positional `$1/$2/$3` substitution. If not, update the templates to use `$ARGUMENTS` with a structured format (key-value pairs) and have the agent parse the structured input. This is consistent with how other commands like `/implement` and `/classify_issue` work.
