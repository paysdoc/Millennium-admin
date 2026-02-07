# Chore: Update Classifiers to Include PR Review

## Chore Description
The classification system currently supports three issue types: `/chore`, `/bug`, and `/feature`. PR Review (defined in `.claude/commands/pr_review.md`) requires its own classification type to be properly routed through the ADW (AI Developer Workflow) system. This chore updates the classification process to include `/pr_review` as a valid classification type with appropriate commit prefixes, branch prefixes, and workflow integration.

## Relevant Files
Use these files to resolve the chore:

- **`adws/core/dataTypes.ts`** - Defines the `IssueClassSlashCommand` type union and the `commitPrefixMap` and `branchPrefixMap` records. This is the foundational file that needs to be updated first.
- **`.claude/commands/classify_issue.md`** - The metaprompt template used by the classifier agent to determine which command to return. Needs to include `/pr_review` in the command mapping.
- **`adws/adwPlanBuild.tsx`** - Contains the `classifyIssue()` function that validates classification output. The `validCommands` array needs to include `/pr_review`.
- **`adws/github/workflowComments.ts`** - Contains `issueTypeLabels` record that maps issue types to human-readable labels. Needs to include `pr_review` label.
- **`adws/github/gitOperations.ts`** - Contains `inferIssueTypeFromBranch()` function that maps branch prefixes to issue types. Needs to handle `review/` or `pr-review/` branch prefix.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update the IssueClassSlashCommand Type
- Open `adws/core/dataTypes.ts`
- Add `/pr_review` to the `IssueClassSlashCommand` type union on line 10
- Update the type to: `export type IssueClassSlashCommand = '/chore' | '/bug' | '/feature' | '/pr_review';`

### Step 2: Update the Commit Prefix Map
- In `adws/core/dataTypes.ts`, add a new entry to `commitPrefixMap`
- Add: `'/pr_review': 'review:'` to follow conventional commits pattern
- The map should now have 4 entries

### Step 3: Update the Branch Prefix Map
- In `adws/core/dataTypes.ts`, add a new entry to `branchPrefixMap`
- Add: `'/pr_review': 'review'` to create branches like `review/issue-{number}-{slug}`
- The map should now have 4 entries

### Step 4: Update the Classifier Metaprompt
- Open `.claude/commands/classify_issue.md`
- Add a new command mapping entry for PR review
- Add: `- Respond with /pr_review if the issue is requesting a PR review, code review, or review-related changes.`
- Position it after `/feature` in the command mapping section

### Step 5: Update the Classification Validator
- Open `adws/adwPlanBuild.tsx`
- Locate the `validCommands` array on line 98
- Update it to include `/pr_review`: `const validCommands: IssueClassSlashCommand[] = ['/feature', '/bug', '/chore', '/pr_review'];`

### Step 6: Update the Issue Type Labels
- Open `adws/github/workflowComments.ts`
- Locate the `issueTypeLabels` record around line 216
- Add a new entry: `'/pr_review': 'pr-review'`
- The record should now have 4 entries

### Step 7: Update Branch Inference Function
- Open `adws/github/gitOperations.ts`
- Locate the `inferIssueTypeFromBranch()` function around line 153
- Add a new condition to handle `review/` branch prefix
- Add: `if (branchName.startsWith('review/')) { return '/pr_review'; }`
- Position it before the default feature return

### Step 8: Run Validation Commands
- Execute all validation commands to ensure zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The PR Review classification type should be used when GitHub issues specifically request code review, PR review, or review-related tasks.
- The commit prefix `review:` follows the conventional commits pattern and distinguishes review-related commits from feature, fix, or chore commits.
- The branch prefix `review` will create branches like `review/issue-26-update-classifiers` for review-specific work.
- The classification still defaults to `/feature` if the classifier returns `0` or fails to classify, maintaining backwards compatibility.
- The PR Review workflow (`adwPrReview.tsx`) currently infers issue type from branch names - this update ensures proper support when the branch is named with `review/` prefix.
