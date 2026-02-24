# Feature: Add additional ADWs and refactor existing ADWs

## Metadata
issueNumber: `155`
adwId: ``
issueJson: ``

## Feature Description
Port all remaining ADW orchestrators marked as "Not yet ported to TypeScript" in `adws/README.md` and integrate new skills (`conditional_docs.md`, `document.md`, `pull_request.md`) into the ADW system. The "Not yet ported" orchestrators are: `adwDocument`, `adwPatch`, `adwPlanBuildReview`, `adwPlanBuildDocument`, and `adwSdlc`. Additionally, the existing PR creation phase (`prPhase.ts`) must be refactored to use the new `/pull_request` skill via a Claude agent instead of the hardcoded `createPullRequest()` function. The standalone `adwTest` and `adwReview` are already ported (as `adwTest.tsx` and `adwPrReview.tsx`), so they only need their README entries updated.

## User Story
As a developer using the ADW system
I want all ADW orchestrators available as TypeScript scripts and new skills integrated
So that I can run any workflow combination (document, patch, plan+build+review, plan+build+document, full SDLC) from the CLI and benefit from improved PR creation via the `/pull_request` skill

## Problem Statement
Several ADW orchestrators referenced in the README are marked "Not yet ported to TypeScript", preventing users from running standalone document, patch, plan+build+review, plan+build+document, and full SDLC workflows. Additionally, three new skills (`conditional_docs.md`, `document.md`, `pull_request.md`) have been added but are not yet integrated into the ADW pipeline. The PR creation phase uses a hardcoded approach instead of leveraging the `/pull_request` skill.

## Solution Statement
1. Create new orchestrator scripts: `adwDocument.tsx`, `adwPatch.tsx`, `adwPlanBuildReview.tsx`, `adwPlanBuildDocument.tsx`, `adwSdlc.tsx`
2. Create new phase functions: `executeDocumentPhase` in `phases/documentPhase.ts` and `executePatchPhase` in `phases/patchPhase.ts`
3. Create new agent functions: `runDocumentAgent` in `agents/documentAgent.ts` and `runPatchPlanAgent` (already exists as `runPatchAgent` in `patchAgent.ts`, extend with plan-only mode)
4. Refactor `prPhase.ts` to use the `/pull_request` skill via `runClaudeAgentWithCommand` instead of the hardcoded `createPullRequest()` function
5. Update `adwCommandToOrchestratorMap` in `core/issueTypes.ts` to map new commands to their orchestrators
6. Update `classify_adw.md` to include new orchestrator commands
7. Update `adws/README.md` to remove "Not yet ported" markers

## Relevant Files
Use these files to implement the feature:

- `adws/README.md` - Contains the list of ADW scripts and their porting status; needs "Not yet ported" markers removed
- `adws/adwPlanBuildTestReview.tsx` - Reference orchestrator pattern (Plan+Build+Test+Review)
- `adws/adwPlanBuildTest.tsx` - Reference orchestrator pattern (Plan+Build+Test)
- `adws/adwPlanBuild.tsx` - Reference orchestrator pattern (Plan+Build)
- `adws/adwPlan.tsx` - Reference orchestrator pattern (Plan only)
- `adws/adwTest.tsx` - Reference standalone orchestrator pattern (Test only)
- `adws/adwBuild.tsx` - Reference standalone orchestrator pattern (Build only)
- `adws/adwPrReview.tsx` - Reference standalone orchestrator pattern (PR Review)
- `adws/workflowPhases.ts` - Re-export barrel file for phases; needs new exports
- `adws/phases/index.ts` - Phase exports barrel; needs new exports
- `adws/phases/workflowLifecycle.ts` - Contains `initializeWorkflow`, `completeWorkflow`, `executeReviewPhase`, `handleWorkflowError`
- `adws/phases/prPhase.ts` - Current PR creation phase; must be refactored to use `/pull_request` skill
- `adws/phases/buildPhase.ts` - Build phase reference pattern
- `adws/phases/testPhase.ts` - Test phase reference pattern
- `adws/phases/planPhase.ts` - Plan phase reference pattern
- `adws/phases/prReviewPhase.ts` - PR review phase reference pattern
- `adws/agents/index.ts` - Agent exports barrel; needs new exports
- `adws/agents/claudeAgent.ts` - `runClaudeAgentWithCommand` function used to invoke skills
- `adws/agents/gitAgent.ts` - Pattern for skill-based agents (branch name, commit)
- `adws/agents/patchAgent.ts` - Existing patch agent; needs extension for standalone use
- `adws/agents/reviewAgent.ts` - Review agent reference pattern
- `adws/core/issueTypes.ts` - Contains `AdwSlashCommand`, `adwCommandToIssueTypeMap`, `adwCommandToOrchestratorMap`; needs new orchestrator mappings
- `adws/core/dataTypes.ts` - Barrel re-export for types
- `adws/core/config.ts` - Configuration constants
- `adws/github/pullRequestCreator.ts` - Current hardcoded PR creator; will be replaced by skill-based approach in prPhase
- `.claude/commands/document.md` - New document skill to be used by `runDocumentAgent`
- `.claude/commands/pull_request.md` - New pull_request skill to be used by refactored PR phase
- `.claude/commands/conditional_docs.md` - New conditional docs skill; document phase should invoke this
- `.claude/commands/patch.md` - Existing patch skill; used by `adwPatch.tsx`
- `.claude/commands/classify_adw.md` - ADW classification; needs new commands listed
- `guidelines/coding_guidelines.md` - Coding guidelines to follow

### New Files
- `adws/adwDocument.tsx` - Standalone document orchestrator
- `adws/adwPatch.tsx` - Standalone patch orchestrator
- `adws/adwPlanBuildReview.tsx` - Plan+Build+Review orchestrator
- `adws/adwPlanBuildDocument.tsx` - Plan+Build+Document orchestrator
- `adws/adwSdlc.tsx` - Full SDLC orchestrator (Plan+Build+Test+Review+Document)
- `adws/phases/documentPhase.ts` - Document phase implementation
- `adws/agents/documentAgent.ts` - Document agent (runs `/document` skill)
- `adws/agents/prAgent.ts` - PR agent (runs `/pull_request` skill)

## Implementation Plan
### Phase 1: Foundation
1. Create the PR agent (`prAgent.ts`) that invokes the `/pull_request` skill via `runClaudeAgentWithCommand`
2. Refactor `prPhase.ts` to use the new PR agent instead of the hardcoded `createPullRequest()` function
3. Create the document agent (`documentAgent.ts`) that invokes the `/document` skill
4. Create the document phase (`documentPhase.ts`) that orchestrates the document agent
5. Update barrel exports in `agents/index.ts`, `phases/index.ts`, and `workflowPhases.ts`

### Phase 2: Core Implementation
1. Create the five new orchestrator scripts following existing patterns:
   - `adwDocument.tsx` - Standalone documentation
   - `adwPatch.tsx` - Standalone patch workflow
   - `adwPlanBuildReview.tsx` - Plan+Build+Review (skip test)
   - `adwPlanBuildDocument.tsx` - Plan+Build+Document (skip test and review)
   - `adwSdlc.tsx` - Full SDLC (Plan+Build+Test+Review+Document)
2. Update `adwCommandToOrchestratorMap` in `core/issueTypes.ts` to map `/adw_document`, `/adw_patch`, `/adw_plan_build_review`, `/adw_plan_build_document`, and `/adw_sdlc` to their respective orchestrators

### Phase 3: Integration
1. Update `.claude/commands/classify_adw.md` to reflect any new ADW commands if needed
2. Update `adws/README.md` to remove all "Not yet ported to TypeScript" markers and add usage examples for the new scripts
3. Run validation to ensure everything compiles and passes tests

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create PR Agent (`adws/agents/prAgent.ts`)
- Create `prAgent.ts` following the pattern from `gitAgent.ts`
- Implement `formatPullRequestArgs(branchName, issueJson, planFile, adwId)` that formats args matching the `/pull_request` skill variables
- Implement `extractPrUrlFromOutput(output)` to extract the PR URL from the skill's output
- Implement `runPullRequestAgent(branchName, issueJson, planFile, adwId, logsDir, statePath?, cwd?)` that calls `runClaudeAgentWithCommand('/pull_request', args, ...)`
- Export from `agents/index.ts`

### Step 2: Refactor PR Phase (`adws/phases/prPhase.ts`)
- Replace the hardcoded `createPullRequest()` call with the new `runPullRequestAgent()` from `prAgent.ts`
- Update the function signature of `executePRPhase` to be `async` and return `Promise<{ costUsd: number; modelUsage: ModelUsageMap }>` to match other phase signatures
- Pass the `branchName`, issue JSON, plan file path, and `adwId` from `config` to the PR agent
- Extract the PR URL from the agent result and set `ctx.prUrl`
- Update all callers of `executePRPhase` in existing orchestrators (`adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlanBuildTestReview.tsx`) to `await` the result and accumulate cost/modelUsage

### Step 3: Create Document Agent (`adws/agents/documentAgent.ts`)
- Create `documentAgent.ts` following the pattern from `gitAgent.ts`
- Implement `formatDocumentArgs(adwId, specPath?, screenshotsDir?)` matching the `/document` skill variables
- Implement `extractDocPathFromOutput(output)` to extract the documentation file path
- Implement `runDocumentAgent(adwId, logsDir, specPath?, screenshotsDir?, statePath?, cwd?)` that calls `runClaudeAgentWithCommand('/document', args, ...)`
- Export from `agents/index.ts`

### Step 4: Create Document Phase (`adws/phases/documentPhase.ts`)
- Create `documentPhase.ts` following the pattern from other phase files (e.g., `buildPhase.ts`)
- Implement `executeDocumentPhase(config, screenshotsDir?)` that:
  - Gets the plan file path from `getPlanFilePath(issueNumber)`
  - Calls `runDocumentAgent` with the appropriate args
  - Tracks cost and model usage
  - Posts workflow comments for document phase stages
  - Returns `{ costUsd, modelUsage }`
- Export from `phases/index.ts` and `workflowPhases.ts`

### Step 5: Update Barrel Exports
- Add `runPullRequestAgent` and related exports to `adws/agents/index.ts`
- Add `runDocumentAgent` and related exports to `adws/agents/index.ts`
- Add `executeDocumentPhase` to `adws/phases/index.ts`
- Add `executeDocumentPhase` to `adws/workflowPhases.ts`

### Step 6: Create `adwPlanBuildReview.tsx` Orchestrator
- Follow the pattern from `adwPlanBuildTestReview.tsx` but skip the test phase
- Workflow: initializeWorkflow → executePlanPhase → executeBuildPhase → executePRPhase → executeReviewPhase → completeWorkflow
- Include usage message, argument parsing, cost tracking, and error handling

### Step 7: Create `adwPlanBuildDocument.tsx` Orchestrator
- Follow the pattern from `adwPlanBuildTest.tsx` but replace test phase with document phase
- Workflow: initializeWorkflow → executePlanPhase → executeBuildPhase → executePRPhase → executeDocumentPhase → completeWorkflow
- Include usage message, argument parsing, cost tracking, and error handling

### Step 8: Create `adwSdlc.tsx` Orchestrator
- Follow the pattern from `adwPlanBuildTestReview.tsx` and add document phase at the end
- Workflow: initializeWorkflow → executePlanPhase → executeBuildPhase → executeTestPhase → executePRPhase → executeReviewPhase → executeDocumentPhase → completeWorkflow
- Pass `reviewResult.screenshotsDir` (if available) to `executeDocumentPhase` so documentation includes screenshots
- Include usage message, argument parsing, cost tracking, and error handling

### Step 9: Create `adwDocument.tsx` Standalone Orchestrator
- Follow the pattern from `adwTest.tsx` (standalone, not using `initializeWorkflow`)
- Accept `[adw-id]` and optional `--cwd` arguments
- Initialize agent state manually
- Call `runDocumentAgent` with the ADW ID and optional spec path
- Print summary and handle errors

### Step 10: Create `adwPatch.tsx` Standalone Orchestrator
- Follow the pattern from `adwTest.tsx` (standalone)
- Accept `<issueNumber>` and optional `[adw-id]` and `--cwd` arguments
- Fetch the issue, initialize state
- Use the existing `runPatchAgent` from `patchAgent.ts` to generate a patch plan
- Then run the build agent to implement the patch
- Then run commit agent
- Then run PR agent
- Print summary and handle errors

### Step 11: Update `adwCommandToOrchestratorMap` in `core/issueTypes.ts`
- Add mapping for `/adw_review` → `adws/adwPrReview.tsx`
- Add mapping for `/adw_document` → `adws/adwDocument.tsx`
- Add mapping for `/adw_patch` → `adws/adwPatch.tsx`
- Add mapping for `/adw_plan_build_review` → `adws/adwPlanBuildReview.tsx`
- Add mapping for `/adw_plan_build_document` → `adws/adwPlanBuildDocument.tsx`
- Keep `/adw_sdlc` mapping updated to `adws/adwSdlc.tsx` (currently mapped to `adwPlanBuildTestReview.tsx`)

### Step 12: Update `adws/README.md`
- Remove all "Not yet ported to TypeScript" markers
- Add usage examples for each new orchestrator (`adwDocument.tsx`, `adwPatch.tsx`, `adwPlanBuildReview.tsx`, `adwPlanBuildDocument.tsx`, `adwSdlc.tsx`)
- Update the quick reference section at the top of the file
- Update the "Run complete SDLC" example to reference `adwSdlc.tsx`
- Update the technical details section to list new orchestrator files

### Step 13: Update `classify_adw.md` and Conditional Docs
- Verify `.claude/commands/classify_adw.md` already lists all valid ADW commands (it does — `/adw_document`, `/adw_patch`, etc. are already listed)
- No changes needed to `classify_adw.md` since all commands are already defined

### Step 14: Add Document Workflow Stages to `workflowTypes.ts`
- Add document-related workflow stages to the `WorkflowStage` type: `'document_running'`, `'document_completed'`, `'document_failed'`
- These are needed for the `postWorkflowComment` calls in the document phase

### Step 15: Run Validation Commands
- Run `npm run lint` to check for lint errors
- Run `npm run build` to verify the project builds without errors
- Run `npm test` to verify all tests pass with zero regressions

## Testing Strategy
### Unit Tests
- Test `formatPullRequestArgs` produces correct formatted string matching `/pull_request` skill variables
- Test `extractPrUrlFromOutput` correctly extracts PR URL from agent output
- Test `formatDocumentArgs` produces correct formatted string matching `/document` skill variables
- Test `extractDocPathFromOutput` correctly extracts file path from agent output
- Test updated `adwCommandToOrchestratorMap` maps all commands to correct orchestrator paths

### Edge Cases
- PR agent output with extra whitespace or multiple lines
- Document agent with and without optional `specPath` and `screenshotsDir` parameters
- Patch workflow with missing issue or plan file
- SDLC workflow when review produces no screenshots directory
- Recovery state handling in new orchestrators

## Acceptance Criteria
- All five new orchestrators (`adwDocument.tsx`, `adwPatch.tsx`, `adwPlanBuildReview.tsx`, `adwPlanBuildDocument.tsx`, `adwSdlc.tsx`) exist and follow existing patterns
- PR phase uses the `/pull_request` skill instead of hardcoded `createPullRequest()`
- Document phase uses the `/document` skill
- `adwCommandToOrchestratorMap` maps all ADW commands to their orchestrators
- `adws/README.md` has no "Not yet ported to TypeScript" markers
- `npm run lint` passes with zero errors
- `npm run build` passes with zero errors
- `npm test` passes with zero regressions

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The existing `adwTest.tsx` and `adwPrReview.tsx` are already functional standalone scripts; only README markers need to be updated for them.
- The `/pull_request` skill handles git push and `gh pr create` internally, so the refactored `prPhase.ts` should not duplicate those operations.
- The `pullRequestCreator.ts` file can remain in the codebase as it may still be imported by `adwBuild.tsx` directly; however the phase-level `prPhase.ts` should use the agent-based approach.
- Document phase workflow stages need to be added to `WorkflowStage` type so `postWorkflowComment` can be called with document-specific stages.
- The `/document` skill expects the agent to run `git diff` and create files — it handles its own file creation, so the phase just needs to invoke it and track results.
- New orchestrators should all use `mergeModelUsageMaps` and `persistTokenCounts` for cost tracking consistency.
- The `adwPatch.tsx` standalone script is different from the existing patch-within-review flow; it creates a direct patch from an issue without a full plan cycle.
