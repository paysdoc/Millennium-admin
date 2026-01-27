# Chore: Add GitHub Issue Comments Throughout ADW Workflow

## Chore Description
Update the ADW plan builder (`adws/adwPlanBuild.tsx`) to post GitHub issue comments at key workflow milestones to provide visibility into the workflow progress. The comments should be posted when:

1. Starting ADW workflow
2. Issue classified as (feature/bug/chore)
3. Working on branch
4. Building implementation plan
5. Implementation plan created
6. Plan file created
7. Committing plan
8. Implementing solution
9. Solution implemented
10. Committing implementation
11. Creating pull request
12. Pull request created
13. ADW workflow completed successfully
14. An error occurred

This will improve observability and allow stakeholders to track the progress of automated development workflows directly from the GitHub issue.

## Relevant Files
Use these files to resolve the chore:

- **`adws/adwPlanBuild.tsx`** - Main orchestrator file that contains the workflow logic. This is the primary file to modify. It already imports `commentOnIssue` from `githubApi` and uses it in two places (after plan commit and after build commit). Needs to be updated to add comments at all specified workflow stages.

- **`adws/githubApi.ts`** - Contains the `commentOnIssue` function that posts comments to GitHub issues using the `gh` CLI. This function is already implemented and working. No changes needed unless we want to add batching or rate limiting.

- **`adws/dataTypes.ts`** - Contains TypeScript type definitions. May need a new type for workflow stages/milestones to improve type safety.

- **`adws/utils.ts`** - Contains utility functions including `log`. No changes needed.

### New Files
- **`adws/workflowComments.ts`** - New module to centralize workflow comment formatting functions. This keeps comment templates separate from orchestration logic, following the modular design guideline.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Define Workflow Stage Types
- Add a new type `WorkflowStage` to `adws/dataTypes.ts` that enumerates all the workflow stages
- Include stages: `starting`, `classified`, `branch_created`, `plan_building`, `plan_created`, `plan_file_created`, `plan_committing`, `implementing`, `implemented`, `implementation_committing`, `pr_creating`, `pr_created`, `completed`, `error`

### Step 2: Create Workflow Comments Module
- Create new file `adws/workflowComments.ts`
- Add a function `formatWorkflowComment(stage: WorkflowStage, context: WorkflowContext): string` that returns the formatted comment for each stage
- Define a `WorkflowContext` interface that includes: `issueNumber`, `adwId`, `branchName?`, `issueType?`, `planPath?`, `prUrl?`, `errorMessage?`
- Create individual format functions for each stage to keep the code modular
- Use emoji prefixes to make comments visually distinct (e.g., rocket for starting, checkmark for success, x for error)

### Step 3: Add Helper Function for Safe Commenting
- In `adws/workflowComments.ts`, add a function `postWorkflowComment(issueNumber: number, stage: WorkflowStage, context: WorkflowContext): void`
- This function should wrap `commentOnIssue` and handle any errors gracefully (log but don't fail the workflow)
- This prevents comment failures from breaking the main workflow

### Step 4: Update Main Orchestrator
- Update `adws/adwPlanBuild.tsx` to import the new `postWorkflowComment` function
- Add comments at each workflow stage in the `main()` function:
  - After "Starting ADW Plan & Build workflow" log
  - After issue classification
  - After branch creation
  - Before running Plan Agent
  - After Plan Agent completes (replace existing `formatPlanComment`)
  - After plan file is confirmed to exist
  - Before committing plan
  - Before running Build Agent
  - After Build Agent completes (replace existing `formatBuildComment`)
  - Before committing implementation
  - Before creating PR
  - After PR is created
  - At the end of successful workflow
  - In the catch block for error handling

### Step 5: Remove Deprecated Comment Functions
- Remove `formatPlanComment` function from `adwPlanBuild.tsx` (moved to workflowComments.ts)
- Remove `formatBuildComment` function from `adwPlanBuild.tsx` (moved to workflowComments.ts)
- Update all references to use the new `postWorkflowComment` function

### Step 6: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the chore is complete with zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The `commentOnIssue` function in `githubApi.ts` already handles errors gracefully (logs but doesn't throw), but the new wrapper adds an extra layer of safety
- Consider rate limiting if GitHub API rate limits become an issue with many comments per workflow
- Comments should be concise to avoid cluttering the issue thread - detailed information should go in collapsible sections
- The ADW ID should be included in all comments to allow correlation of comments from the same workflow run
- Use consistent formatting with the existing comment style in the codebase (markdown with headers, code blocks for file paths and branch names)
- Emojis make the workflow stages easy to scan at a glance in the GitHub issue timeline
