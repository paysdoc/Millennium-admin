# Bug: ADW Worktree Creation Always Uses 'feature' Prefix

## Bug Description
When the ADW (AI Developer Workflow) creates a worktree for an issue, it always names the branch with a `feature/` prefix regardless of the actual issue classification (bug, chore, feature, or pr_review). The worktree and branch are created BEFORE the issue classification happens, so the correct prefix (bugfix/, chore/, review/) cannot be applied.

**Expected behavior:** Worktree branch names should reflect the issue classification:
- `feature/issue-N-...` for features
- `bugfix/issue-N-...` for bugs
- `chore/issue-N-...` for chores
- `review/issue-N-...` for PR reviews

**Actual behavior:** All worktrees are created with `feature/issue-N-...` regardless of issue type.

## Problem Statement
In `adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`, the `generateBranchName` function is called with only the issue number and title, using the default issue type `/feature`. The issue classification happens later in `adwPlan.tsx`, but by then the worktree has already been created with the wrong branch name prefix.

The sequence is:
1. Fetch issue details
2. Generate branch name (uses default `/feature` prefix)
3. Create worktree with that branch name
4. Run adwPlan.tsx (which classifies the issue - too late!)

## Solution Statement
Move the issue classification step to happen BEFORE the branch name is generated in the orchestrator scripts (`adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`). This ensures the correct branch prefix is used when creating the worktree.

The updated sequence will be:
1. Fetch issue details
2. **Classify the issue** (determines the issue type)
3. Generate branch name (using the classified issue type)
4. Create worktree with the correctly prefixed branch name
5. Run adwPlan.tsx (skip classification since already done)

## Steps to Reproduce
1. Create a new GitHub issue with a title like "fix login bug" (clearly a bug)
2. Trigger the ADW workflow via webhook or CRON trigger
3. Observe that the worktree is created at `.worktrees/feature-issue-N-...` instead of `.worktrees/bugfix-issue-N-...`

## Root Cause Analysis
The root cause is the order of operations in `adwPlanBuild.tsx:109-114` and `adwPlanBuildTest.tsx:111-116`:

```typescript
// Branch name generated BEFORE classification - uses default '/feature'
const branchName = generateBranchName(issueNumber, issue.title);

// Worktree created with wrong prefix
const worktreePath = ensureWorktree(branchName, defaultBranch);
```

The `generateBranchName` function in `gitOperations.ts:25-33` accepts an optional `issueType` parameter that defaults to `/feature`:

```typescript
export function generateBranchName(
  issueNumber: number,
  title: string,
  issueType: IssueClassSlashCommand = '/feature'  // <-- Default is always feature
): string {
  const slug = slugify(title);
  const prefix = branchPrefixMap[issueType];
  return `${prefix}/issue-${issueNumber}-${slug}`;
}
```

The `branchPrefixMap` in `dataTypes.ts:27-32` correctly maps issue types to prefixes:
```typescript
export const branchPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feature',
  '/bug': 'bugfix',
  '/chore': 'chore',
  '/pr_review': 'review',
};
```

## Relevant Files
Use these files to fix the bug:

- `adws/adwPlanBuild.tsx` - Orchestrator script for bug/PR review workflows. Needs to classify issue before generating branch name (lines 109-114).
- `adws/adwPlanBuildTest.tsx` - Orchestrator script for feature/chore workflows. Needs to classify issue before generating branch name (lines 111-116).
- `adws/adwPlan.tsx` - Planning phase script. Contains the `classifyIssue` function that needs to be extracted and reused (lines 57-101).
- `adws/triggers/issueClassifier.ts` - Contains `classifyIssueForTrigger` function that can be reused. Already has the classification logic.
- `adws/github/gitOperations.ts` - Contains `generateBranchName` function. Already supports `issueType` parameter, no changes needed.
- `adws/core/dataTypes.ts` - Contains `branchPrefixMap` and `IssueClassSlashCommand` types. No changes needed.
- `adws/__tests__/worktreeOperations.test.ts` - Existing tests for worktree operations. May need to update tests to verify correct prefix usage.

### New Files
- `adws/__tests__/branchNameGeneration.test.ts` - New test file to specifically test branch name generation with different issue types.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create a shared classification utility function
- Import the `classifyIssueForTrigger` function from `adws/triggers/issueClassifier.ts` into the orchestrator scripts, OR
- Extract a reusable `classifyIssue` function that can be called from both `adwPlan.tsx` and the orchestrator scripts
- The utility should accept a GitHub issue and return an `IssueClassSlashCommand`

### Step 2: Modify adwPlanBuild.tsx to classify before branch creation
- Import the classification utility
- After fetching the issue (line 102), call the classification function to get the issue type
- Pass the issue type to `generateBranchName` (line 110): `generateBranchName(issueNumber, issue.title, issueType)`
- Log the classification result for debugging
- Update the workflow comment to include the issue type if applicable

### Step 3: Modify adwPlanBuildTest.tsx to classify before branch creation
- Apply the same changes as Step 2 to `adwPlanBuildTest.tsx`
- Import the classification utility
- After fetching the issue (line 104), call the classification function
- Pass the issue type to `generateBranchName` (line 112)
- Log the classification result

### Step 4: Update adwPlan.tsx to skip classification if already done
- Accept an optional `--issue-type` CLI argument in `adwPlan.tsx`
- If the issue type is provided via CLI, skip the classification step (lines 296-329)
- This prevents duplicate classification calls and saves API costs
- Modify the orchestrator scripts to pass `--issue-type` to adwPlan

### Step 5: Add unit tests for branch name generation with different issue types
- Create `adws/__tests__/branchNameGeneration.test.ts`
- Test that `generateBranchName` produces correct prefixes for all issue types:
  - `/feature` -> `feature/issue-N-...`
  - `/bug` -> `bugfix/issue-N-...`
  - `/chore` -> `chore/issue-N-...`
  - `/pr_review` -> `review/issue-N-...`

### Step 6: Run validation commands
- Execute all validation commands to ensure the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions
- `npx vitest run adws/__tests__/branchNameGeneration.test.ts` - Run the new branch name generation tests
- `npx vitest run adws/__tests__/worktreeOperations.test.ts` - Run worktree operations tests

## Notes
- The triggers (`trigger_webhook.ts` and `trigger_cron.ts`) already classify issues correctly before spawning workflows, but they don't pass this information to the spawned scripts. An alternative approach would be to pass the issue type as a CLI argument from the triggers, but having the orchestrators classify issues themselves is more self-contained and resilient.
- The `classifyIssueForTrigger` function in `issueClassifier.ts` uses the haiku model for fast, cost-effective classification. The same model should be used in the orchestrators for consistency.
- No new libraries are required for this fix.
- The fix is backward compatible - if classification fails for any reason, it will default to `/feature` which maintains current behavior.
