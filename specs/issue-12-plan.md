# Feature: Update ADW to React to PR Comments

## Feature Description
Extend the ADW (AI Developer Workflow) system to detect PR review comments on its created pull requests and automatically plan and implement the requested changes. After the ADW completes its initial workflow and creates a PR, if reviewers leave comments on the PR, the ADW should detect those comments, re-run the Plan and Build agents to address the feedback, commit the changes, and push to the existing PR branch.

## User Story
As a **code reviewer**
I want to **leave comments on an ADW-created PR and have the ADW automatically address them**
So that **review feedback is implemented without manual intervention, regardless of whether the ADW workflow was previously marked as done**

## Problem Statement
Currently, the ADW workflow is a one-shot process: it creates a plan, implements it, opens a PR, and marks itself as completed. If a reviewer leaves comments on the PR requesting changes, a human must manually implement those changes. There is no mechanism for the ADW to react to PR review feedback.

## Solution Statement
Add a PR comment reaction system to the ADW with three components:

1. **PR Comment Detection** — A new module (`adws/prCommentDetector.ts`) that fetches PR review comments using the `gh` CLI and determines if there are unaddressed comments (comments posted after the last ADW commit on the branch).

2. **PR Comment Workflow Orchestrator** — A new entry point (`adws/adwPrReview.tsx`) that, given a PR number, fetches the PR review comments, runs the Plan Agent to create a revision plan, runs the Build Agent to implement the changes, commits, and pushes to the existing PR branch. Posts status updates as PR comments.

3. **Trigger Integration** — Update the CRON trigger (`adws/trigger_cron.ts`) to also poll for open PRs with new review comments and spawn the PR review workflow. Add a new webhook event handler for `pull_request_review_comment` events.

## Relevant Files
Use these files to implement the feature:

### Existing Files (Modify)
- `adws/trigger_cron.ts` — Add polling for open PRs with unaddressed review comments.
- `adws/trigger_webhook.py` — Add handler for `pull_request_review_comment` and `pull_request_review` webhook events.
- `adws/buildAgent.ts` — Add a new prompt builder for PR review changes (reuse `runClaudeAgent`).
- `adws/planAgent.ts` — Add a new prompt builder for PR review planning (reuse `runClaudeAgent`).
- `adws/dataTypes.ts` — Add new types for PR comments and PR review workflow stages.
- `adws/workflowComments.ts` — Add PR-comment-specific workflow stage formatters and posting to PR (not issue).
- `adws/githubApi.ts` — Add functions to fetch PR details, PR review comments, and post PR comments.
- `adws/gitOperations.ts` — Add function to checkout an existing PR branch.
- `package.json` — Add npm script for the PR review workflow.

### New Files
- `adws/adwPrReview.tsx` — Main orchestrator for the PR review workflow.
- `adws/prCommentDetector.ts` — Detects unaddressed PR review comments by comparing comment timestamps against last ADW commit.

### Existing Files (Reference Only)
- `adws/adwPlanBuild.tsx` — Reference for workflow orchestration patterns, recovery, and comment posting.
- `adws/claudeAgent.ts` — Agent execution engine (reuse as-is).
- `adws/pullRequestCreator.ts` — Reference for `gh pr` CLI patterns.
- `adws/config.ts` — Environment configuration patterns.
- `adws/utils.ts` — Logging and utility functions.

## Implementation Plan

### Phase 1: Data Types and GitHub API Extensions
Extend the type system and GitHub API layer to support PR review comments and PR metadata.

### Phase 2: PR Comment Detection
Create the module that determines whether a PR has unaddressed review comments that the ADW should respond to.

### Phase 3: PR Review Workflow Orchestrator
Create the main workflow script that processes PR review comments end-to-end: detect comments → plan changes → implement → commit → push.

### Phase 4: Workflow Comments for PR Reviews
Add PR-specific comment formatting so the ADW posts status updates directly on the PR.

### Phase 5: Trigger Integration
Update both triggers to detect PRs with new review comments and spawn the PR review workflow.

### Phase 6: Validation
Run all validation commands and verify the feature works end-to-end.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add New Types to `adws/dataTypes.ts`
- Add `PRReviewComment` interface with fields: `id`, `author` (GitHubUser), `body`, `path` (file path), `line`, `createdAt`, `updatedAt`
- Add `PRDetails` interface with fields: `number`, `title`, `body`, `state`, `headBranch`, `baseBranch`, `url`, `issueNumber` (extracted from body), `reviewComments` (PRReviewComment[])
- Add new `PRReviewWorkflowStage` type with stages: `'pr_review_starting'`, `'pr_review_planning'`, `'pr_review_planned'`, `'pr_review_implementing'`, `'pr_review_implemented'`, `'pr_review_committing'`, `'pr_review_pushed'`, `'pr_review_completed'`, `'pr_review_error'`

### 2. Add GitHub API Functions to `adws/githubApi.ts`
- Add `fetchPRDetails(prNumber: number): PRDetails` — Uses `gh pr view <number> --json number,title,body,state,headBranchName,baseBranchName,url`
- Add `fetchPRReviewComments(prNumber: number): PRReviewComment[]` — Uses `gh api repos/{owner}/{repo}/pulls/{number}/comments` to get review comments
- Add `commentOnPR(prNumber: number, body: string): void` — Uses `gh pr comment <number> --body-file -`
- Add `fetchPRList(): PRListItem[]` — Uses `gh pr list --json number,headBranchName,updatedAt,comments` for the CRON trigger

### 3. Create PR Comment Detector (`adws/prCommentDetector.ts`)
- Create function `getLastAdwCommitTimestamp(branchName: string): Date | null` — Uses `git log` to find the most recent commit authored by the ADW (by checking commit message patterns like `feat: implement #` or `feat: address PR review`)
- Create function `getUnaddressedComments(prNumber: number): PRReviewComment[]` — Fetches PR review comments and filters to those created after the last ADW commit timestamp
- Create function `hasUnaddressedComments(prNumber: number): boolean` — Returns true if there are any unaddressed comments
- Handle edge case: if no ADW commits found, treat all non-bot comments as unaddressed

### 4. Add Git Operations to `adws/gitOperations.ts`
- Add `checkoutBranch(branchName: string): void` — Runs `git checkout <branchName>` and `git pull origin <branchName>` to ensure latest code

### 5. Create PR Review Plan Agent Prompt in `adws/planAgent.ts`
- Add function `buildPrReviewPlanPrompt(prDetails: PRDetails, comments: PRReviewComment[], existingPlanContent: string): string` — Builds a prompt that includes the original plan, the PR review comments with file paths and line numbers, and asks the Plan Agent to create a revision plan
- Add function `runPrReviewPlanAgent(prDetails: PRDetails, comments: PRReviewComment[], existingPlanContent: string, logsDir: string): Promise<AgentResult>` — Runs the plan agent with the PR review prompt

### 6. Create PR Review Build Agent Prompt in `adws/buildAgent.ts`
- Add function `buildPrReviewImplementPrompt(prDetails: PRDetails, comments: PRReviewComment[], revisionPlan: string): string` — Builds a prompt that includes the PR review comments and the revision plan
- Add function `runPrReviewBuildAgent(prDetails: PRDetails, comments: PRReviewComment[], revisionPlan: string, logsDir: string, onProgress?: ProgressCallback): Promise<AgentResult>` — Runs the build agent with the PR review prompt

### 7. Add PR Review Comment Formatters to `adws/workflowComments.ts`
- Add `PRReviewWorkflowContext` interface extending `WorkflowContext` with `prNumber`, `reviewComments` count, `revisionPlanOutput`, `revisionBuildOutput`
- Add formatter functions for each `PRReviewWorkflowStage`:
  - `formatPrReviewStartingComment()` — "Addressing PR review comments"
  - `formatPrReviewPlanningComment()` — "Planning changes based on review feedback"
  - `formatPrReviewImplementedComment()` — "Changes implemented and pushed"
  - `formatPrReviewCompletedComment()` — "All review comments addressed"
  - `formatPrReviewErrorComment()` — Error with details
- Add `postPRWorkflowComment(prNumber: number, stage: PRReviewWorkflowStage, ctx: PRReviewWorkflowContext): void` — Posts formatted comment to the PR (not the issue)

### 8. Create PR Review Workflow Orchestrator (`adws/adwPrReview.tsx`)
- Accept CLI argument: `<pr-number>`
- Workflow steps:
  1. Fetch PR details and extract issue number from PR body (`Implements #N`)
  2. Detect unaddressed review comments; exit early if none
  3. Generate ADW ID and create logs directory
  4. Post "starting" comment on PR
  5. Checkout the PR's head branch and pull latest
  6. Read the existing plan file (`specs/issue-{N}-plan.md`)
  7. Run PR Review Plan Agent with original plan + review comments → produces revision plan
  8. Run PR Review Build Agent with revision plan + review comments → implements changes
  9. Commit changes with message `feat: address PR review comments for #N`
  10. Push to the PR branch
  11. Post "completed" comment on PR with summary
- Error handling: post error comment on PR if any step fails
- Add `#!/usr/bin/env npx tsx` shebang for direct execution

### 9. Update CRON Trigger (`adws/trigger_cron.ts`)
- Add `processedPRs` Set to track already-processed PR numbers
- Add function `fetchOpenPRs()` — Uses `gh pr list --state open --json number,headBranchName,updatedAt`
- Add function `checkPRsForReviewComments()` — For each open PR not in `processedPRs`:
  - Import and call `hasUnaddressedComments(prNumber)`
  - If true, add to `processedPRs` and spawn `npx tsx adws/adwPrReview.tsx <pr-number>`
- Call `checkPRsForReviewComments()` in the existing `checkAndTrigger()` function or as a separate interval
- Use a longer poll interval for PR checks (60 seconds) since PR reviews are less time-sensitive

### 10. Update Webhook Trigger (`adws/trigger_webhook.py`)
- Add handling for `X-GitHub-Event: pull_request_review_comment` events
- Extract `pull_request.number` from the payload
- Spawn `npx tsx adws/adwPrReview.tsx <pr-number>` as a detached background process
- Also handle `pull_request_review` events (for review submissions)
- Return `{"status": "triggered", "pr": <number>}` for PR events

### 11. Add npm Script to `package.json`
- Add `"adw:pr-review": "tsx adws/adwPrReview.tsx"` to scripts section

### 12. Run Validation Commands
- Execute all validation commands to verify the changes work correctly with zero regressions

## Testing Strategy

### Unit Tests
- No formal unit test framework is set up. Validation is done via lint and build checks.

### Integration Tests
- **PR Comment Detection**: Create a test PR with review comments, run `prCommentDetector` functions to verify correct detection of unaddressed comments.
- **PR Review Workflow**: Manually trigger `adwPrReview.tsx` on a PR with review comments. Verify it plans, implements, commits, pushes, and posts status comments.
- **CRON Trigger**: Start the CRON trigger, leave a review comment on an open PR, verify the trigger detects it and spawns the PR review workflow.
- **Webhook Trigger**: Send a mock `pull_request_review_comment` webhook payload, verify it triggers the PR review workflow.

### Edge Cases
- PR has no review comments (workflow should exit early with no action)
- PR has only bot comments (should be filtered out)
- PR has comments that were already addressed by a previous ADW run (timestamp comparison)
- PR branch has diverged or has conflicts (error handling and reporting)
- Original plan file doesn't exist (use PR body as context instead)
- Multiple review comments on different files (all should be included in the plan)
- PR is already closed or merged (should exit early)
- Concurrent triggers for the same PR (processedPRs set prevents duplicates)

## Acceptance Criteria
- [ ] `adws/adwPrReview.tsx` exists and can be run with `npx tsx adws/adwPrReview.tsx <pr-number>`
- [ ] PR review comments are detected by comparing timestamps against last ADW commit
- [ ] Plan Agent receives review comments with file paths and line numbers for context
- [ ] Build Agent implements changes based on the revision plan
- [ ] Changes are committed and pushed to the existing PR branch
- [ ] Status comments are posted on the PR (not the issue) at each workflow stage
- [ ] CRON trigger polls for open PRs with unaddressed review comments
- [ ] Webhook trigger handles `pull_request_review_comment` events
- [ ] Workflow exits early if no unaddressed comments are found
- [ ] Workflow exits early if PR is closed or merged
- [ ] npm script `adw:pr-review` is added to `package.json`
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json 2>/dev/null || npx tsc --noEmit` — Type-check the ADW TypeScript files

## Notes
- **No new npm dependencies needed**: All GitHub interactions use the `gh` CLI, and agent execution reuses `claudeAgent.ts`.
- **Comment vs Review Comment**: GitHub has two types of PR feedback — general PR comments (`gh pr comment`) and review comments on specific lines (`gh api` for `/pulls/{n}/comments`). This feature addresses both but prioritizes line-specific review comments since they contain actionable code feedback.
- **Idempotency**: The timestamp-based detection ensures the workflow only processes comments that appeared after its last commit, preventing infinite loops where the ADW keeps re-processing its own changes.
- **Cost awareness**: Each PR review cycle runs both Plan and Build agents (Opus model). The workflow logs costs, and the CRON trigger uses a longer interval (60s) for PR checks to avoid excessive API calls.
- **Branch safety**: The workflow checks out the existing PR branch and pulls latest before making changes, avoiding merge conflicts with any manual commits.
