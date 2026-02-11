# Feature: Implement ADW Review and Patch Agents with Plan-Build-Test-Review Orchestrator

## Feature Description
Implement new ADW agents for `/review` and `/patch` slash commands, along with a review-patch retry loop and a new `adwPlanBuildTestReview` orchestrator. The review agent validates implemented features against their spec files, identifying blocker issues. The patch agent resolves blocker issues found during review. When blockers are detected, the system automatically patches each blocker, commits and pushes changes, then re-runs review — repeating up to a configurable maximum (env var, default 3). The new orchestrator extends the existing `adwPlanBuildTest` workflow by adding a review phase after the PR creation phase, emulating an actual code and functionality review.

## User Story
As a developer using the ADW system
I want automated review and patching of implemented features against their spec
So that code quality issues are caught and resolved before merging, reducing manual review effort

## Problem Statement
The current ADW workflow (`adwPlanBuildTest`) covers planning, building, testing, and PR creation, but lacks an automated review step that validates the implementation against the original spec. Blocker issues may go unnoticed until a human reviewer catches them. There is no automated mechanism to fix blocking review issues and iterate.

## Solution Statement
Add two new non-orchestrator agents (`reviewAgent` and `patchAgent`) modeled on existing patterns (`testAgent` and `buildAgent`). Create a review-patch retry loop (modeled on `testRetry.ts`) that iterates: review → patch blockers → commit+push → re-review. Add a new `adwPlanBuildTestReview` orchestrator that composes all existing phases plus a new review phase after the PR phase. Create the `/review` and `/patch` slash command templates in `.claude/commands/`. Update routing so `/adw_plan_build_test_review` dispatches to the new orchestrator.

## Relevant Files
Use these files to implement the feature:

- `adws/agents/testAgent.ts` — Pattern reference for the review agent (calls a slash command, parses JSON output)
- `adws/agents/buildAgent.ts` — Pattern reference for the patch agent (calls `/implement` with context)
- `adws/agents/claudeAgent.ts` — Base agent runner (`runClaudeAgentWithCommand`)
- `adws/agents/testRetry.ts` — Pattern reference for the review-patch retry loop
- `adws/agents/gitAgent.ts` — Commit agent used for committing patches between review iterations
- `adws/agents/index.ts` — Agent module exports (needs new exports)
- `adws/core/config.ts` — Configuration constants (needs `MAX_REVIEW_RETRY_ATTEMPTS`)
- `adws/core/dataTypes.ts` — Type definitions (needs new `AgentIdentifier` values, review workflow stages)
- `adws/core/index.ts` — Core module exports (needs new config export)
- `adws/workflowPhases.ts` — Composable phase functions (needs `executeReviewPhase`)
- `adws/index.ts` — ADW module exports (needs new exports)
- `adws/adwPlanBuildTest.tsx` — Existing orchestrator to model the new one on
- `adws/adwPrReview.tsx` — Existing orchestrator pattern reference
- `adws/triggers/issueClassifier.ts` — Workflow routing (`getWorkflowScript` needs update)
- `adws/__tests__/workflowPhases.test.ts` — Existing tests to extend
- `.claude/commands/classify_adw.md` — Already lists `/adw_plan_build_test_review`

### New Files
- `.claude/commands/review.md` — Review slash command template (from issue attachment)
- `.claude/commands/patch.md` — Patch slash command template (from issue attachment)
- `.claude/commands/prepare_app.md` — App preparation helper command (referenced by review.md; starts dev server)
- `adws/agents/reviewAgent.ts` — Review agent that calls `/review` and parses review results
- `adws/agents/patchAgent.ts` — Patch agent that calls `/patch` for each blocker issue
- `adws/agents/reviewRetry.ts` — Review-patch retry loop with commit+push between iterations
- `adws/adwPlanBuildTestReview.tsx` — New Plan+Build+Test+PR+Review orchestrator
- `adws/__tests__/reviewAgent.test.ts` — Unit tests for review agent
- `adws/__tests__/patchAgent.test.ts` — Unit tests for patch agent
- `adws/__tests__/reviewRetry.test.ts` — Unit tests for review-patch retry logic

## Implementation Plan
### Phase 1: Foundation
Add the core infrastructure needed before implementing the agents:
1. Create the `/review` and `/patch` slash command templates in `.claude/commands/`
2. Create `prepare_app.md` helper command if it doesn't exist
3. Add `MAX_REVIEW_RETRY_ATTEMPTS` env variable to `adws/core/config.ts`
4. Add new `AgentIdentifier` values (`review-agent`, `patch-agent`) and review workflow stage types to `adws/core/dataTypes.ts`
5. Export new config constant from `adws/core/index.ts`

### Phase 2: Core Implementation
Build the three new agent modules:
1. `reviewAgent.ts` — Modeled on `testAgent.ts`. Calls `/review` with adw_id, spec_file, and agent_name. Parses the JSON response containing `success`, `review_summary`, `review_issues`, and `screenshots`. Extracts blocker issues for downstream patching.
2. `patchAgent.ts` — Modeled on `buildAgent.ts`. Calls `/patch` with adw_id, the blocker's issue_description + issue_resolution, the spec_path, and agent_name. Returns the patch result.
3. `reviewRetry.ts` — Modeled on `testRetry.ts`. Implements the review→patch→commit+push→re-review loop. Uses `MAX_REVIEW_RETRY_ATTEMPTS` (default 3). For each iteration: runs review agent, if blockers found runs patch agent for each blocker, then calls `runCommitAgent` and `pushBranch` before the next review attempt.

### Phase 3: Integration
Wire everything together:
1. Add `executeReviewPhase()` to `workflowPhases.ts` that orchestrates the review-patch retry loop with state tracking and workflow comments.
2. Create `adwPlanBuildTestReview.tsx` orchestrator that composes: `initializeWorkflow` → `executePlanPhase` → `executeBuildPhase` → `executeTestPhase` → `executePRPhase` → `executeReviewPhase` → `completeWorkflow`.
3. Update `getWorkflowScript` in `issueClassifier.ts` to route `/adw_plan_build_test_review` ADW commands to the new orchestrator.
4. Update all index/export files to expose the new agents and phases.
5. Add comprehensive unit tests for all new modules.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the `/review` slash command template
- Create `.claude/commands/review.md` with the review command template from the GitHub issue attachment
- The command takes variables: `adw_id` ($1), `spec_file` ($2), `agent_name` ($3, default: 'review_agent'), `review_image_dir` (constructed from adw_id and agent_name)
- The command instructs the agent to: check git branch, run `git diff origin/main`, find and read the spec file, take screenshots of critical functionality, compare implementation against spec, and return JSON with `success`, `review_summary`, `review_issues` (each with `review_issue_number`, `screenshot_path`, `issue_description`, `issue_resolution`, `issue_severity`), and `screenshots`
- Issue severity levels: `skippable`, `tech_debt`, `blocker`
- `success` is `true` when there are NO blocker issues

### Step 2: Create the `/patch` slash command template
- Create `.claude/commands/patch.md` with the patch command template from the GitHub issue attachment
- The command takes variables: `adw_id` ($1), `review_change_request` ($2), `spec_path` ($3, optional), `agent_name` ($4, optional), `issue_screenshots` ($5, optional)
- The command instructs the agent to create a focused patch plan in `specs/patch/` directory and implement the fix
- The patch command should be focused on resolving a single review blocker issue

### Step 3: Create the `prepare_app.md` helper command
- Create `.claude/commands/prepare_app.md` if it does not already exist
- This command prepares the application for review by installing dependencies and starting the dev server
- Instructions: run `npm install`, then start the dev server with `npm run dev` in the background, wait for the server to be ready on `http://localhost:3000`

### Step 4: Update core types and configuration
- In `adws/core/config.ts`: Add `MAX_REVIEW_RETRY_ATTEMPTS` constant reading from `process.env.MAX_REVIEW_RETRY_ATTEMPTS` with default of `3`
- In `adws/core/dataTypes.ts`:
  - Add `'review-agent'` and `'patch-agent'` to the `AgentIdentifier` union type
  - Add review workflow stages to `WorkflowStage`: `'review_running'`, `'review_passed'`, `'review_failed'`, `'review_patching'`
- In `adws/core/index.ts`: Export `MAX_REVIEW_RETRY_ATTEMPTS` from config

### Step 5: Create the review agent (`adws/agents/reviewAgent.ts`)
- Model on `testAgent.ts` pattern
- Define `ReviewIssue` interface: `{ review_issue_number: number; screenshot_path: string; issue_description: string; issue_resolution: string; issue_severity: 'skippable' | 'tech_debt' | 'blocker' }`
- Define `ReviewResult` interface: `{ success: boolean; review_summary: string; review_issues: ReviewIssue[]; screenshots: string[] }`
- Define `ReviewAgentResult` extending `AgentResult`: `{ reviewResult: ReviewResult | null; passed: boolean; blockerIssues: ReviewIssue[] }`
- Implement `parseReviewResult(output: string): ReviewResult | null` — parse JSON from agent output, similar to `parseE2ETestResult`
- Implement `runReviewAgent(adwId: string, specFile: string, logsDir: string, statePath?: string, cwd?: string): Promise<ReviewAgentResult>`
  - Format args as: `${adwId}\n${specFile}\n${agentName}`
  - Call `runClaudeAgentWithCommand('/review', args, 'Review', outputFile, 'opus', undefined, statePath, cwd)`
  - Parse the output, extract blocker issues (where `issue_severity === 'blocker'`)
  - Return `ReviewAgentResult` with parsed data
- Write unit tests in `adws/__tests__/reviewAgent.test.ts`
  - Test `parseReviewResult` with valid JSON, malformed JSON, embedded JSON in text
  - Test `runReviewAgent` calls `runClaudeAgentWithCommand` with correct args
  - Test blocker extraction logic

### Step 6: Create the patch agent (`adws/agents/patchAgent.ts`)
- Model on `buildAgent.ts` pattern
- Implement `formatPatchArgs(adwId: string, reviewIssue: ReviewIssue, specPath?: string, screenshots?: string): string` — format args for the `/patch` command
- Implement `runPatchAgent(adwId: string, reviewIssue: ReviewIssue, logsDir: string, specPath?: string, onProgress?: ProgressCallback, statePath?: string, cwd?: string): Promise<AgentResult>`
  - Format args with adw_id, review change request (issue_description + issue_resolution), spec_path, agent_name, screenshots
  - Call `runClaudeAgentWithCommand('/patch', args, 'Patch: <issue_number>', outputFile, 'opus', onProgress, statePath, cwd)`
  - Return the result
- Write unit tests in `adws/__tests__/patchAgent.test.ts`
  - Test `formatPatchArgs` output format
  - Test `runPatchAgent` calls `runClaudeAgentWithCommand` with correct args and model
  - Test handling of optional specPath and screenshots

### Step 7: Create the review-patch retry loop (`adws/agents/reviewRetry.ts`)
- Model on `testRetry.ts` pattern
- Define `ReviewRetryResult` interface: `{ passed: boolean; costUsd: number; totalRetries: number; blockerIssues: ReviewIssue[] }`
- Define `ReviewRetryOptions` interface: `{ adwId: string; specFile: string; logsDir: string; orchestratorStatePath: string; maxRetries: number; branchName: string; issueType: IssueClassSlashCommand; issueContext: string; onReviewFailed?: (attempt: number, maxAttempts: number) => void; cwd?: string }`
- Implement `runReviewWithRetry(opts: ReviewRetryOptions): Promise<ReviewRetryResult>`
  - Loop up to `maxRetries`:
    1. Run `runReviewAgent(adwId, specFile, logsDir, statePath, cwd)`
    2. If `passed` (no blockers): return success
    3. If blockers found: for each blocker run `runPatchAgent(adwId, blockerIssue, logsDir, specPath, undefined, statePath, cwd)`
    4. After all patches: call `runCommitAgent('review-agent', issueType, issueContext, logsDir, undefined, cwd)` to commit
    5. Call `pushBranch(branchName, cwd)` to push changes
    6. Call `onReviewFailed` callback if provided
    7. Increment retry count and loop
  - If max retries exceeded: return failure with remaining blocker issues
- Export from `adws/agents/index.ts`
- Write unit tests in `adws/__tests__/reviewRetry.test.ts`
  - Test happy path: review passes on first attempt
  - Test retry path: review fails, patch runs for each blocker, commit+push, then passes on second attempt
  - Test max retries exceeded
  - Test commit and push called between review iterations
  - Test `onReviewFailed` callback invoked correctly

### Step 8: Add `executeReviewPhase` to `workflowPhases.ts`
- Add `executeReviewPhase(config: WorkflowConfig): Promise<{ costUsd: number; reviewPassed: boolean; totalRetries: number }>` function
- Import `runReviewWithRetry` from agents, `MAX_REVIEW_RETRY_ATTEMPTS` from core, `pushBranch` from github
- Implementation:
  - Determine the spec file path: `getPlanFilePath(config.issueNumber)`
  - Initialize review agent state via `AgentStateManager`
  - Post workflow comments for review stages (`review_running`, etc.)
  - Call `runReviewWithRetry` with config values and `MAX_REVIEW_RETRY_ATTEMPTS`
  - If review fails after max retries: log error, post error comment, write failed state (but do NOT `process.exit` — let the orchestrator handle the failure)
  - Return cost, pass/fail status, and retry count
- Export from `adws/workflowPhases.ts` and `adws/index.ts`
- Add tests to `adws/__tests__/workflowPhases.test.ts`

### Step 9: Create the `adwPlanBuildTestReview` orchestrator
- Create `adws/adwPlanBuildTestReview.tsx` modeled on `adwPlanBuildTest.tsx`
- Usage: `npx tsx adws/adwPlanBuildTestReview.tsx <github-issue-number> [adw-id]`
- Document environment requirements including `MAX_REVIEW_RETRY_ATTEMPTS` (default: 3)
- Implement `main()`:
  1. Parse args (same as `adwPlanBuildTest`)
  2. `initializeWorkflow(issueNumber, adwId, 'plan-build-test-review-orchestrator')`
  3. `executePlanPhase(config)`
  4. `executeBuildPhase(config)`
  5. `executeTestPhase(config)`
  6. `executePRPhase(config)` — create PR first
  7. `executeReviewPhase(config)` — review AFTER PR, patches committed+pushed to existing branch
  8. `completeWorkflow(config, totalCost, metadata)` — include review results in metadata
- Handle errors via `handleWorkflowError(config, error)`
- Add `'plan-build-test-review-orchestrator'` to `AgentIdentifier` in `dataTypes.ts`

### Step 10: Update workflow routing
- In `adws/triggers/issueClassifier.ts`: Update `getWorkflowScript` to accept an optional `adwCommand` parameter
- When `adwCommand` is `/adw_plan_build_test_review`, return `'adws/adwPlanBuildTestReview.tsx'`
- Update callers of `getWorkflowScript` in `trigger_webhook.ts` and `trigger_cron.ts` to pass the ADW command through
- Update existing tests in `adws/__tests__/issueClassifier.test.ts` to cover the new routing

### Step 11: Update all exports and index files
- In `adws/agents/index.ts`: Export `runReviewAgent`, `runPatchAgent`, `runReviewWithRetry`, `ReviewIssue`, `ReviewResult`, `ReviewAgentResult`, `ReviewRetryResult`, `ReviewRetryOptions`
- In `adws/index.ts`: Export `executeReviewPhase` and new agent exports
- In `adws/core/index.ts`: Ensure `MAX_REVIEW_RETRY_ATTEMPTS` is exported

### Step 12: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the feature works with zero regressions

## Testing Strategy
### Unit Tests
- `adws/__tests__/reviewAgent.test.ts`:
  - `parseReviewResult` correctly parses valid JSON output
  - `parseReviewResult` handles malformed JSON gracefully (returns null)
  - `parseReviewResult` extracts JSON embedded in surrounding text
  - `runReviewAgent` calls `runClaudeAgentWithCommand` with `/review`, correct args, and `opus` model
  - `runReviewAgent` correctly identifies blocker issues from review results
  - `runReviewAgent` returns `passed: true` when no blockers exist (even with skippable/tech_debt issues)
- `adws/__tests__/patchAgent.test.ts`:
  - `formatPatchArgs` produces correct format with all parameters
  - `formatPatchArgs` handles optional parameters gracefully
  - `runPatchAgent` calls `runClaudeAgentWithCommand` with `/patch`, correct args, and `opus` model
  - `runPatchAgent` passes through `cwd` to the underlying agent
- `adws/__tests__/reviewRetry.test.ts`:
  - Happy path: review passes on first attempt, no patches needed
  - Retry path: first review has blockers, patches resolve them, second review passes
  - Max retries: review never passes, returns failure with remaining blockers
  - Commit and push are called after each patch round (before next review)
  - `onReviewFailed` callback is invoked with correct attempt/maxAttempts
  - Cost accumulation across review and patch agents
- `adws/__tests__/workflowPhases.test.ts` (new tests added):
  - `executeReviewPhase` calls `runReviewWithRetry` with correct config
  - `executeReviewPhase` posts appropriate workflow comments
  - `executeReviewPhase` returns cost and pass/fail status

### Integration Tests
- The new orchestrator (`adwPlanBuildTestReview.tsx`) correctly composes all phases in order
- Review phase executes AFTER PR creation phase
- Patches are committed and pushed before re-review

### Edge Cases
- Review returns no issues at all (passes immediately)
- Review returns only `skippable` and `tech_debt` issues (should pass, no patching needed)
- Review returns mixed severity issues (only patch blockers)
- Patch agent fails for one blocker but succeeds for others
- Review JSON output is embedded in markdown code blocks
- Empty or malformed review JSON output
- `MAX_REVIEW_RETRY_ATTEMPTS` set to 0 (should skip review or fail immediately)
- `MAX_REVIEW_RETRY_ATTEMPTS` set to 1 (only one review attempt, no retries)
- Spec file doesn't exist at expected path
- No uncommitted changes after patching (commit agent should handle gracefully)

## Acceptance Criteria
- New `/review` slash command template exists at `.claude/commands/review.md` and follows the structure from the issue attachment
- New `/patch` slash command template exists at `.claude/commands/patch.md` and follows the structure from the issue attachment
- `reviewAgent.ts` calls `/review`, parses JSON output, and identifies blocker issues
- `patchAgent.ts` calls `/patch` for individual blocker issues
- `reviewRetry.ts` implements the review→patch→commit→push→re-review loop up to `MAX_REVIEW_RETRY_ATTEMPTS` (default 3)
- Patches are committed and pushed to the branch before each subsequent review iteration
- `adwPlanBuildTestReview.tsx` orchestrator executes: Plan → Build → Test → PR → Review → Complete
- Review phase runs AFTER the PR phase
- `/adw_plan_build_test_review` ADW command routes to the new orchestrator
- `MAX_REVIEW_RETRY_ATTEMPTS` env variable controls retry limit with default of 3
- All new code has corresponding unit tests
- All existing tests continue to pass (zero regressions)
- `npm run lint`, `npm run build`, and `npm test` all pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The review.md and patch.md templates are provided as attachments on the GitHub issue. Use them as the basis for the slash command templates. If the full content cannot be retrieved from the attachment URLs, reconstruct them based on the structure described in the issue and the patterns of existing commands.
- The `prepare_app.md` command is referenced by the review template's Setup section. Create it as a minimal helper that prepares the app for UI-based review (install deps, start dev server).
- The review agent uses `opus` model for complex reasoning (same as build and test resolution agents).
- The patch agent also uses `opus` model since it performs code modifications.
- The `AgentIdentifier` type is a union type; adding new values is backward-compatible.
- The `WorkflowStage` type is also a union type; new stages are additive.
- The `getWorkflowScript` function in `issueClassifier.ts` currently routes by issue type only. It needs to be updated to also consider the ADW command for precise orchestrator routing. The `IssueClassificationResult` already carries `adwCommand`, so pass it through.
- Existing ADW commands like `/adw_plan_build_test_review` are already defined in `AdwSlashCommand` and `adwCommandToIssueTypeMap` (maps to `/feature`), and in `classify_adw.md`. No changes needed there.
