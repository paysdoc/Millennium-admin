# Bug: Issue categorization not applied to follow-up actions

## Bug Description

When a GitHub issue is processed by the ADW (Agentic Development Workflow) system, the issue is correctly classified as one of three types: `/feature`, `/bug`, or `/chore`. However, the follow-up actions after classification always use "feature" conventions regardless of the actual issue type:

**Symptoms:**
- Branch names always use `feature/issue-{number}-{slug}` format, even for bugs and chores
- Implementation commits always use `feat:` prefix instead of `fix:` for bugs or `chore:` for chores
- PR review commits always use `feat:` prefix
- Recovery detection only looks for `feat:` commit patterns, potentially missing bug/chore workflows

**Expected Behavior:**
- Bug issues should create `bugfix/issue-{number}-{slug}` branches with `fix:` commit prefixes
- Chore issues should create `chore/issue-{number}-{slug}` branches with `chore:` commit prefixes
- Feature issues should continue using `feature/issue-{number}-{slug}` branches with `feat:` commit prefixes
- Recovery detection should recognize all commit prefix patterns

**Actual Behavior:**
- All issues create `feature/` branches regardless of type
- Implementation commits always use `feat:` prefix (line 403 in adwPlanBuild.tsx)
- PR review commits always use `feat:` prefix (lines 158-159 in adwPrReview.tsx)
- Branch name extraction only matches `feature/` pattern (line 85 in workflowComments.ts)

## Problem Statement

The issue classification system correctly identifies issue types but fails to propagate this classification to branch naming and commit messages. This inconsistency causes:
1. Misleading branch names that don't reflect the nature of the work
2. Inconsistent git history where all commits appear as features
3. Potential issues with conventional commit tooling that relies on prefixes
4. Recovery detection may fail for bug/chore workflows

## Solution Statement

Update the ADW workflow to consistently apply issue classification throughout all follow-up actions:
1. Create a branch prefix mapping based on issue type (feature/, bugfix/, chore/)
2. Use the existing `commitPrefixMap` consistently for all commit messages
3. Update recovery detection patterns to recognize all commit prefixes
4. Update branch name extraction to match all branch prefix patterns

## Steps to Reproduce

1. Create a GitHub issue with bug-related content (e.g., "Fix login button not working")
2. Trigger the ADW workflow for this issue
3. Observe that the issue is classified as `/bug` (visible in GitHub comments)
4. Check the created branch name - it will be `feature/issue-{number}-{slug}` instead of `bugfix/issue-{number}-{slug}`
5. Check the implementation commit message - it will use `feat:` instead of `fix:`

## Root Cause Analysis

The root cause is inconsistent application of the `IssueClassSlashCommand` type throughout the workflow:

1. **Branch naming (`gitOperations.ts:19-22`)**: The `generateFeatureBranchName()` function is hardcoded to use `feature/` prefix and doesn't accept an issue type parameter.

2. **Implementation commit (`adwPlanBuild.tsx:403`)**: The implementation commit message is hardcoded to use `feat:` instead of using the `commitPrefixMap` that already exists at line 108-112.

3. **PR review commits (`adwPrReview.tsx:158-159`)**: The PR review commit messages are hardcoded to use `feat:` and don't have access to the original issue type.

4. **Recovery detection (`prCommentDetector.ts:26-28`)**: The ADW commit patterns only look for `feat:` prefixes, missing commits with `fix:` or `chore:` prefixes.

5. **Branch extraction (`workflowComments.ts:85`)**: The regex pattern only matches `feature/` branches, missing `bugfix/` and `chore/` branches.

## Relevant Files

Use these files to fix the bug:

### `adws/github/gitOperations.ts`
- Contains `generateFeatureBranchName()` function (line 19-22) that hardcodes `feature/` prefix
- Contains `createFeatureBranch()` function (line 29-47) that calls the generator
- Needs: Branch prefix mapping and updated function signatures to accept issue type

### `adws/adwPlanBuild.tsx`
- Contains `commitPrefixMap` (line 108-112) - the mapping already exists
- Contains hardcoded `feat:` implementation commit (line 403)
- Needs: Use `commitPrefixMap` for implementation commit instead of hardcoded `feat:`

### `adws/adwPrReview.tsx`
- Contains hardcoded `feat:` PR review commits (lines 158-159)
- Needs: Access to issue type and use of commit prefix mapping

### `adws/github/prCommentDetector.ts`
- Contains ADW commit patterns (lines 26-28) that only match `feat:` prefix
- Needs: Updated patterns to match `fix:` and `chore:` prefixes as well

### `adws/github/workflowComments.ts`
- Contains `extractBranchNameFromComment()` (line 84-86) with regex that only matches `feature/`
- Needs: Updated regex to match `bugfix/` and `chore/` branch prefixes

### `adws/core/dataTypes.ts`
- Contains `IssueClassSlashCommand` type definition (line 10)
- Reference file - no changes needed, but used for type safety

## Step by Step Tasks

### Step 1: Add branch prefix mapping to gitOperations.ts

- Add a `branchPrefixMap` constant that maps `IssueClassSlashCommand` to branch prefixes:
  - `/feature` → `feature`
  - `/bug` → `bugfix`
  - `/chore` → `chore`
- Rename `generateFeatureBranchName()` to `generateBranchName()` and add `issueType` parameter
- Update the function to use the branch prefix mapping
- Update `createFeatureBranch()` to accept `issueType` parameter and pass it to the generator
- Add the `IssueClassSlashCommand` import from core

### Step 2: Update adwPlanBuild.tsx to pass issue type to branch creation

- Update the `createFeatureBranch()` call (line 307) to pass the `issueType` parameter
- Update the implementation commit (line 403) to use `commitPrefixMap[issueType]` instead of hardcoded `feat:`
- Ensure `issueType` is available in scope where the implementation commit is made

### Step 3: Update adwPrReview.tsx to use correct commit prefix

- Add logic to extract the issue type from the PR context:
  - Option A: Extract from the plan file which contains the issue classification
  - Option B: Parse the branch name to infer the issue type (bugfix/ → bug, chore/ → chore, feature/ → feature)
- Add the `commitPrefixMap` (or import it from a shared location)
- Update the commit message (lines 158-159) to use the correct prefix based on issue type

### Step 4: Update prCommentDetector.ts to recognize all commit prefixes

- Update the `adwPatterns` array (lines 25-29) to include patterns for all commit prefixes:
  - Add `/fix: implement #/` for bug fixes
  - Add `/chore: implement #/` for chores
  - Add `/fix: address PR review/` for bug fix PR reviews
  - Add `/chore: address PR review/` for chore PR reviews
  - Add `/fix: add implementation plan for #/` for bug fix plans
  - Add `/chore: add implementation plan for #/` for chore plans

### Step 5: Update workflowComments.ts to extract all branch name patterns

- Update the `extractBranchNameFromComment()` function (line 84-86)
- Change the regex pattern from `/\`(feature\/issue-\d+[a-z0-9-]*)\`/` to `/\`((feature|bugfix|chore)\/issue-\d+[a-z0-9-]*)\`/`
- This allows extraction of branch names with any of the three prefixes

### Step 6: Move commitPrefixMap to a shared location

- Move `commitPrefixMap` from `adwPlanBuild.tsx` to `adws/core/dataTypes.ts` or a new shared constants file
- Export it so it can be imported by both `adwPlanBuild.tsx` and `adwPrReview.tsx`
- Update imports in both files

### Step 7: Add branchPrefixMap to shared location

- Add `branchPrefixMap` to the same shared location as `commitPrefixMap`
- Export it for use in `gitOperations.ts` and potentially `workflowComments.ts`

### Step 8: Add utility function to infer issue type from branch name

- Create a helper function `inferIssueTypeFromBranch(branchName: string): IssueClassSlashCommand`
- This function parses the branch prefix and returns the corresponding issue type
- Add to `gitOperations.ts` or a shared utility file
- Use in `adwPrReview.tsx` to determine the commit prefix from the PR's head branch

### Step 9: Run validation commands

- Run `npm run lint` to ensure no linting errors
- Run `npm run build` to verify no TypeScript/build errors
- Run `npm test` to ensure no regressions

## Validation Commands

Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

### Manual Validation Steps

After running the automated validation commands, manually verify:

1. **Bug Issue Test:**
   - Create a test issue with bug-related content
   - Run: `npx tsx adws/adwPlanBuild.tsx <issue-number>` (dry run or on test repo)
   - Verify branch name starts with `bugfix/`
   - Verify commits use `fix:` prefix

2. **Chore Issue Test:**
   - Create a test issue with chore-related content
   - Run: `npx tsx adws/adwPlanBuild.tsx <issue-number>` (dry run or on test repo)
   - Verify branch name starts with `chore/`
   - Verify commits use `chore:` prefix

3. **Feature Issue Test (regression):**
   - Create a test issue with feature-related content
   - Verify existing feature behavior is unchanged
   - Verify branch name starts with `feature/`
   - Verify commits use `feat:` prefix

## Notes

- The `commitPrefixMap` already exists in `adwPlanBuild.tsx` at lines 108-112. The fix involves using it consistently and sharing it across files.
- The plan commit (line 343) already correctly uses `commitPrefixMap[issueType]`. Only the implementation commit (line 403) needs fixing.
- Consider adding unit tests for the new utility functions (`inferIssueTypeFromBranch`, `generateBranchName` with issue type).
- The branch naming convention follows common Git conventions: `feature/`, `bugfix/`, `chore/`.
- No new libraries are required for this fix.
