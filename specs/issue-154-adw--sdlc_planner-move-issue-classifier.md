# Chore: Move issue classifier out of triggers directory

## Metadata
issueNumber: `154`
adwId: ``
issueJson: ``

## Chore Description
The `issueClassifier.ts` file currently lives in `adws/triggers/` but it is not a trigger. Triggers are entry points that start workflows (e.g., `trigger_cron.ts`, `trigger_webhook.ts`). The issue classifier is core classification logic used by both triggers and the workflow lifecycle phase (`workflowLifecycle.ts`). It should be moved to `adws/core/` where other shared logic resides (utils, config, data types, orchestrator helpers).

This chore involves:
1. Moving `adws/triggers/issueClassifier.ts` to `adws/core/issueClassifier.ts`
2. Updating all import paths across the codebase
3. Updating the `adws/core/index.ts` barrel export to re-export classifier functions
4. Updating the `README.md` and `adws/README.md` documentation to reflect the new location

## Relevant Files
Use these files to resolve the chore:

- `adws/triggers/issueClassifier.ts` — The file being moved. Contains `parseAdwClassificationOutput`, `classifyWithAdwCommand`, `classifyIssueForTrigger`, `classifyGitHubIssue`, `getWorkflowScript`, and the `IssueClassificationResult` interface.
- `adws/core/index.ts` — Barrel export for the core module. Needs to re-export the classifier functions and types after the move.
- `adws/triggers/trigger_cron.ts` — Imports `classifyIssueForTrigger` and `getWorkflowScript` from `./issueClassifier`. Must update to `../core/issueClassifier` or `../core`.
- `adws/triggers/trigger_webhook.ts` — Imports `classifyIssueForTrigger` and `getWorkflowScript` from `./issueClassifier`. Must update to `../core/issueClassifier` or `../core`.
- `adws/phases/workflowLifecycle.ts` — Imports `classifyGitHubIssue` from `../triggers/issueClassifier`. Must update to `../core/issueClassifier` or `../core`.
- `adws/__tests__/issueClassifier.test.ts` — Test file for the classifier. Must update import path from `../triggers/issueClassifier` to `../core/issueClassifier`.
- `adws/__tests__/workflowPhases.test.ts` — Mocks `../triggers/issueClassifier`. Must update mock path to `../core/issueClassifier`.
- `adws/__tests__/tokenLimitRecovery.test.ts` — Mocks `../triggers/issueClassifier`. Must update mock path to `../core/issueClassifier`.
- `adws/core/jsonParser.ts` — Contains a JSDoc comment referencing `issueClassifier.ts`. Update the comment to reflect the new location.
- `README.md` — Project structure section lists `issueClassifier` under `triggers/`. Must update to show it under `core/`.
- `adws/README.md` — Technical details section lists `issueClassifier.ts` under `Triggers (triggers/)`. Must move the entry to `Core (core/)`.
- `guidelines/coding_guidelines.md` — Reference for coding standards to follow during the chore.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Move the file
- Move `adws/triggers/issueClassifier.ts` to `adws/core/issueClassifier.ts` using `git mv` to preserve history.
- Verify the file no longer exists in `adws/triggers/`.

### Step 2: Update internal imports in the moved file
- In `adws/core/issueClassifier.ts`, update the relative import paths:
  - `'../github/githubApi'` → `'../github/githubApi'` (unchanged — same relative distance from `core/`)
  - `'../agents/claudeAgent'` → `'../agents/claudeAgent'` (unchanged)
  - `'../core'` → `'.'` or `'./index'` (since the file is now inside `core/`)
  - `'../core/jsonParser'` → `'./jsonParser'` (now a sibling)

### Step 3: Update the core barrel export
- In `adws/core/index.ts`, add exports from `./issueClassifier`:
  - Export the `IssueClassificationResult` type
  - Export `parseAdwClassificationOutput`, `classifyWithAdwCommand`, `classifyIssueForTrigger`, `classifyGitHubIssue`, `getWorkflowScript`

### Step 4: Update trigger imports
- In `adws/triggers/trigger_cron.ts`, change `import { classifyIssueForTrigger, getWorkflowScript } from './issueClassifier'` to `import { classifyIssueForTrigger, getWorkflowScript } from '../core/issueClassifier'`.
- In `adws/triggers/trigger_webhook.ts`, change `import { classifyIssueForTrigger, getWorkflowScript } from './issueClassifier'` to `import { classifyIssueForTrigger, getWorkflowScript } from '../core/issueClassifier'`.

### Step 5: Update phase imports
- In `adws/phases/workflowLifecycle.ts`, change `import { classifyGitHubIssue } from '../triggers/issueClassifier'` to `import { classifyGitHubIssue } from '../core/issueClassifier'`.

### Step 6: Update test imports and mocks
- In `adws/__tests__/issueClassifier.test.ts`, change `from '../triggers/issueClassifier'` to `from '../core/issueClassifier'` (both the main import and any mock paths).
- In `adws/__tests__/workflowPhases.test.ts`, update both:
  - `vi.mock('../triggers/issueClassifier', ...)` → `vi.mock('../core/issueClassifier', ...)`
  - `import { classifyGitHubIssue } from '../triggers/issueClassifier'` → `import { classifyGitHubIssue } from '../core/issueClassifier'`
- In `adws/__tests__/tokenLimitRecovery.test.ts`, update:
  - `vi.mock('../triggers/issueClassifier', ...)` → `vi.mock('../core/issueClassifier', ...)`

### Step 7: Update JSDoc comment in jsonParser
- In `adws/core/jsonParser.ts`, update the comment referencing `issueClassifier.ts` to clarify it is now a sibling in `core/` (no path change needed if it just says the file name, but verify accuracy).

### Step 8: Update project documentation
- In `README.md`, under the Project Structure section:
  - Move the `issue classifier` reference from `triggers/` to `core/` in the `adws/` description. Update line: `triggers/ - Workflow triggers (webhook, cron, issue classifier)` to `triggers/ - Workflow triggers (webhook, cron)` and add `issue classifier` to the `core/` description: `core/ - Core utilities (state, config, data types, orchestrator, issue classifier)`.
- In `adws/README.md`, under the Technical Details > Core Components section:
  - Move `issueClassifier.ts - Issue classification logic` from the **Triggers** (`triggers/`) section to the **Core** (`core/`) section.

### Step 9: Run validation commands
- Execute every validation command to confirm zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- Use `git mv` instead of manual copy/delete to preserve git history for the moved file.
- The `IssueClassificationResult` interface exported from `issueClassifier.ts` is distinct from the `AdwClassificationResult` interface in `issueTypes.ts` — both should coexist without conflicts.
- The imports in the moved file that reference `'../core'` must be updated to `'.'` since the file will be inside the `core/` directory itself.
