# Chore: Refactor ADW File Structure

## Chore Description
Refactor the `adws/` directory structure to improve organization and maintainability. Currently, all modules are placed at the top level of the `adws/` directory, making it difficult to navigate and understand the codebase. This chore will:

1. Keep only main entry point scripts (`adwPlanBuild.tsx`, `adwPrReview.tsx`, `healthCheck.tsx`) at the top level
2. Move supporting modules into appropriate subdirectories based on logical categorization
3. Minimize the number of subdirectory categories while maintaining clear separation of concerns
4. Update all import statements across the codebase to reflect the new file locations

### Current Structure
```
adws/
├── __tests__/
│   └── githubApi.test.ts
├── triggers/
│   ├── trigger_cron.ts
│   └── trigger_webhook.ts
├── adwPlanBuild.tsx         # Main entry point
├── adwPrReview.tsx          # Main entry point
├── healthCheck.tsx          # Main entry point
├── index.ts                 # Barrel export
├── tsconfig.json
├── buildAgent.ts
├── claudeAgent.ts
├── config.ts
├── dataTypes.ts
├── gitOperations.ts
├── githubApi.ts
├── planAgent.ts
├── prCommentDetector.ts
├── pullRequestCreator.ts
├── utils.ts
└── workflowComments.ts
```

### Proposed Structure
```
adws/
├── __tests__/               # Tests (unchanged location)
│   └── githubApi.test.ts
├── agents/                  # AI agent modules
│   ├── index.ts
│   ├── claudeAgent.ts
│   ├── planAgent.ts
│   └── buildAgent.ts
├── github/                  # GitHub & git integration
│   ├── index.ts
│   ├── githubApi.ts
│   ├── gitOperations.ts
│   ├── pullRequestCreator.ts
│   ├── prCommentDetector.ts
│   └── workflowComments.ts
├── core/                    # Core utilities and types
│   ├── index.ts
│   ├── config.ts
│   ├── dataTypes.ts
│   └── utils.ts
├── triggers/                # Trigger scripts (unchanged)
│   ├── trigger_cron.ts
│   └── trigger_webhook.ts
├── adwPlanBuild.tsx         # Main entry point
├── adwPrReview.tsx          # Main entry point
├── healthCheck.tsx          # Main entry point
├── index.ts                 # Root barrel export
└── tsconfig.json
```

## Relevant Files
Use these files to resolve the chore:

### Files to Move

**To `adws/agents/`:**
- `adws/claudeAgent.ts` - Base Claude CLI agent runner with progress tracking
- `adws/planAgent.ts` - Plan generation agent that builds implementation plans
- `adws/buildAgent.ts` - Build agent that implements solutions from plans

**To `adws/github/`:**
- `adws/githubApi.ts` - GitHub CLI wrapper functions (fetch issues, PRs, comments)
- `adws/gitOperations.ts` - Git operations (branch creation, commits, push)
- `adws/pullRequestCreator.ts` - PR creation logic
- `adws/prCommentDetector.ts` - Detects unaddressed PR review comments
- `adws/workflowComments.ts` - Formats and posts workflow status comments

**To `adws/core/`:**
- `adws/config.ts` - Configuration constants and environment variables
- `adws/dataTypes.ts` - TypeScript type definitions
- `adws/utils.ts` - Utility functions (logging, ID generation, slugify)

### Files to Update (imports)
- `adws/adwPlanBuild.tsx` - Main orchestrator, imports from all modules
- `adws/adwPrReview.tsx` - PR review orchestrator, imports from multiple modules
- `adws/healthCheck.tsx` - Health check utility, imports config and utils
- `adws/index.ts` - Root barrel export, re-exports all public APIs
- `adws/triggers/trigger_cron.ts` - CRON trigger, imports github and utils
- `adws/triggers/trigger_webhook.ts` - Webhook trigger, imports utils
- `adws/__tests__/githubApi.test.ts` - Test file for githubApi

### New Files
- `adws/agents/index.ts` - Barrel export for agents module
- `adws/github/index.ts` - Barrel export for github module
- `adws/core/index.ts` - Barrel export for core module

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create New Directory Structure
- Create the `adws/agents/` directory
- Create the `adws/github/` directory
- Create the `adws/core/` directory

### Step 2: Move Core Module Files
- Move `adws/config.ts` to `adws/core/config.ts`
- Move `adws/dataTypes.ts` to `adws/core/dataTypes.ts`
- Move `adws/utils.ts` to `adws/core/utils.ts`
- Create `adws/core/index.ts` barrel export with all public exports from core modules

### Step 3: Update Internal Core Module Imports
- Update `adws/core/utils.ts` to import from `./config` (relative within core)

### Step 4: Move Agent Module Files
- Move `adws/claudeAgent.ts` to `adws/agents/claudeAgent.ts`
- Move `adws/planAgent.ts` to `adws/agents/planAgent.ts`
- Move `adws/buildAgent.ts` to `adws/agents/buildAgent.ts`
- Create `adws/agents/index.ts` barrel export with all public exports from agent modules

### Step 5: Update Internal Agent Module Imports
- Update `adws/agents/claudeAgent.ts` to import from `../core` (dataTypes, config, utils)
- Update `adws/agents/planAgent.ts` to import from `../core` (dataTypes) and `./claudeAgent`
- Update `adws/agents/buildAgent.ts` to import from `../core` (dataTypes, utils) and `./claudeAgent`

### Step 6: Move GitHub Module Files
- Move `adws/githubApi.ts` to `adws/github/githubApi.ts`
- Move `adws/gitOperations.ts` to `adws/github/gitOperations.ts`
- Move `adws/pullRequestCreator.ts` to `adws/github/pullRequestCreator.ts`
- Move `adws/prCommentDetector.ts` to `adws/github/prCommentDetector.ts`
- Move `adws/workflowComments.ts` to `adws/github/workflowComments.ts`
- Create `adws/github/index.ts` barrel export with all public exports from github modules

### Step 7: Update Internal GitHub Module Imports
- Update `adws/github/githubApi.ts` to import from `../core` (dataTypes, utils)
- Update `adws/github/gitOperations.ts` to import from `../core` (utils)
- Update `adws/github/pullRequestCreator.ts` to import from `../core` (dataTypes, utils), `./githubApi`, `./gitOperations`
- Update `adws/github/prCommentDetector.ts` to import from `../core` (dataTypes, utils), `./githubApi`
- Update `adws/github/workflowComments.ts` to import from `../core` (dataTypes, utils), `./githubApi`

### Step 8: Update Main Entry Point Imports
- Update `adws/adwPlanBuild.tsx` imports:
  - Change `./utils` to `./core`
  - Change `./githubApi` to `./github`
  - Change `./gitOperations` to `./github`
  - Change `./planAgent` to `./agents`
  - Change `./buildAgent` to `./agents`
  - Change `./claudeAgent` to `./agents`
  - Change `./pullRequestCreator` to `./github`
  - Change `./dataTypes` to `./core`
  - Change `./workflowComments` to `./github`

- Update `adws/adwPrReview.tsx` imports:
  - Change `./utils` to `./core`
  - Change `./githubApi` to `./github`
  - Change `./gitOperations` to `./github`
  - Change `./planAgent` to `./agents`
  - Change `./buildAgent` to `./agents`
  - Change `./claudeAgent` to `./agents`
  - Change `./workflowComments` to `./github`
  - Change `./prCommentDetector` to `./github`

- Update `adws/healthCheck.tsx` imports:
  - Change `./config` to `./core`
  - Change `./utils` to `./core`

### Step 9: Update Trigger Imports
- Update `adws/triggers/trigger_cron.ts`:
  - Change `../githubApi` to `../github`
  - Change `../prCommentDetector` to `../github`
  - Change `../utils` to `../core`

- Update `adws/triggers/trigger_webhook.ts`:
  - Change `../utils` to `../core`

### Step 10: Update Test Imports
- Update `adws/__tests__/githubApi.test.ts`:
  - Change `../githubApi` to `../github/githubApi` (or `../github` if using barrel)

### Step 11: Update Root Barrel Export
- Update `adws/index.ts` to re-export from the new subdirectory barrel files:
  - Export from `./core`
  - Export from `./agents`
  - Export from `./github`

### Step 12: Verify TypeScript Configuration
- Ensure `adws/tsconfig.json` paths and module resolution work with the new structure
- Check that baseUrl and paths (if any) are correctly configured

### Step 13: Run Validation Commands
- Run linter to ensure no import errors
- Run TypeScript compiler to verify type checking passes
- Run tests to verify functionality is preserved
- Run build to ensure no build errors

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues and import errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Type-check the ADW modules without emitting files
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions
- `npx tsx adws/healthCheck.tsx 14` - Run the health check to verify ADW system works correctly

## Notes

### Import Strategy
Each subdirectory (`agents/`, `github/`, `core/`) will have its own `index.ts` barrel file that exports all public APIs. This allows clean imports like:
```typescript
import { runClaudeAgent, runPlanAgent } from './agents';
import { fetchGitHubIssue, createFeatureBranch } from './github';
import { log, generateAdwId, GitHubIssue } from './core';
```

### Dependency Graph
The modules have the following dependency relationships (important for ordering imports):
1. `core/` - No internal dependencies (config, types, utils are independent)
2. `agents/` - Depends on `core/` only
3. `github/` - Depends on `core/` only
4. Entry points - Depend on all three modules
5. Triggers - Depend on `github/` and `core/`

### Backward Compatibility
The root `adws/index.ts` barrel export will maintain the same public API, so any external code importing from `adws` will continue to work without changes.

### File Movement Commands
Use `git mv` for all file movements to preserve git history:
```bash
git mv adws/config.ts adws/core/config.ts
```

### Test Considerations
- The existing test at `adws/__tests__/githubApi.test.ts` tests the githubApi module
- After refactoring, the import path in the test needs to be updated
- Consider adding a simple smoke test that imports from all barrel files to catch any export issues
