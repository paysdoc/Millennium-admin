# Chore: Update triggers to use adwPlanBuildTest for features and chores

## Chore Description
The ADW (AI Developer Workflow) triggers currently spawn `adwPlanBuild.tsx` for all qualifying issues. This workflow only runs the Plan and Build phases. The chore requires updating the triggers to use `adwPlanBuildTest.tsx` (which includes a Test phase) for issues classified as `feature` or `chore`, while keeping `adwPlanBuild.tsx` for bugs.

Additionally, the classification process in `classify_issue.md` needs to be updated to only classify an issue as `chore` if there is a low likelihood of additional tests being required (e.g., documentation updates, configuration changes, dependency updates).

## Relevant Files
Use these files to resolve the chore:

- `adws/triggers/trigger_cron.ts` - CRON trigger that polls for issues and spawns workflows. Currently spawns `adwPlanBuild.tsx` at line 56. Needs to perform classification and spawn the appropriate workflow.
- `adws/triggers/trigger_webhook.ts` - Webhook trigger that receives GitHub events and spawns workflows. Currently spawns `adwPlanBuild.tsx` at line 197. Needs to perform classification and spawn the appropriate workflow.
- `.claude/commands/classify_issue.md` - The classification prompt used by the haiku model to classify issues. Needs updated criteria for chore classification.
- `adws/github/githubApi.ts` - Contains `fetchGitHubIssue` function needed to get issue details for classification.
- `adws/agents/claudeAgent.ts` - Contains `runClaudeAgentWithCommand` function for running the classifier agent.
- `adws/core/dataTypes.ts` - Contains `IssueClassSlashCommand` type definition.
- `adws/core/index.ts` - Core module exports for utility functions.

### New Files
- `adws/triggers/issueClassifier.ts` - New helper module to extract classification logic for use in triggers, avoiding code duplication between the two triggers.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the Issue Classifier Helper Module
Create a new file `adws/triggers/issueClassifier.ts` that provides a lightweight classification function for use in triggers:

- Import necessary dependencies from `../github/githubApi.ts` and `../agents/claudeAgent.ts`
- Create an interface `IssueClassificationResult` with fields: `issueType: IssueClassSlashCommand`, `success: boolean`
- Create function `classifyIssueForTrigger(issueNumber: number): Promise<IssueClassificationResult>` that:
  - Fetches the issue details using `fetchGitHubIssue`
  - Runs the classifier agent using `runClaudeAgentWithCommand` with the `/classify_issue` command
  - Parses the result and returns the issue type
  - Defaults to `/feature` on failure (to ensure the test phase runs for unknown issues)
- Create helper function `getWorkflowScript(issueType: IssueClassSlashCommand): string` that:
  - Returns `'adws/adwPlanBuildTest.tsx'` for `/feature` and `/chore`
  - Returns `'adws/adwPlanBuild.tsx'` for `/bug` and `/pr_review`
- Export both functions

### Step 2: Update trigger_cron.ts
Modify the CRON trigger to use classification before spawning workflows:

- Add import for `classifyIssueForTrigger` and `getWorkflowScript` from `./issueClassifier`
- Update the `checkAndTrigger` function to be async
- In the loop over qualifying issues:
  - Call `classifyIssueForTrigger(issue.number)` to get the issue classification
  - Call `getWorkflowScript(issueType)` to determine which workflow script to use
  - Update the spawn call at line 56 to use the determined workflow script instead of hardcoded `'adws/adwPlanBuild.tsx'`
  - Log the classification result and workflow being used

### Step 3: Update trigger_webhook.ts
Modify the webhook trigger to use classification before spawning workflows:

- Add import for `classifyIssueForTrigger` and `getWorkflowScript` from `./issueClassifier`
- Update the issue event handler section (around line 196-198):
  - Make the handler async for the issues event
  - Call `classifyIssueForTrigger(issueNumber)` to get the issue classification
  - Call `getWorkflowScript(issueType)` to determine which workflow script to use
  - Update the `spawnDetached` call at line 197 to use the determined workflow script
  - Log the classification result and workflow being used

### Step 4: Update classify_issue.md Classification Criteria
Update the chore classification criteria to be more specific:

- Update the `/chore` command mapping entry to include specific criteria:
  - Documentation-only changes (README, docs, comments)
  - Configuration file updates (tsconfig, eslint, prettier configs)
  - Dependency version updates
  - CI/CD pipeline changes
  - Code style/formatting changes
  - Refactoring with no functional changes
  - File/folder reorganization
- Add explicit note that if the change might require new tests or modifications to existing tests, it should be classified as `/feature` instead
- Add explicit note that bug fixes should use `/bug`, not `/chore`

### Step 5: Run Validation Commands
Run all validation commands to ensure the chore is complete with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The classification happens twice in the workflow: once in the trigger (to decide which workflow to spawn) and once in `adwPlan.tsx` (for branch naming and other purposes). This is acceptable duplication since it ensures the triggers can make informed decisions without modifying the existing workflow structure.
- The classifier uses the `haiku` model for fast, cost-effective classification as established in the existing `adwPlan.tsx` implementation.
- Defaulting to `/feature` on classification failure ensures the test phase is included for uncertain cases, which is the safer default.
- The PR review workflow (`/pr_review`) continues to use `adwPlanBuild.tsx` since PR reviews address existing code changes that have already been tested.
