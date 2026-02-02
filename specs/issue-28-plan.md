# Chore: Refactor Agent Invocation to Use Slash Commands

## Chore Description
Currently, in the ADW process, agents are started using dedicated inline prompts built in TypeScript code. This is incorrect as it duplicates logic that already exists in the `.claude/commands/` directory. All agents should be invoked using slash commands from `.claude/commands/` to ensure consistency, maintainability, and single-source-of-truth for agent prompts.

The current implementation has three problematic patterns:
1. **Plan agents** are invoked through `planAgent.ts` with `buildPlanPrompt()` which builds a custom prompt
2. **Build agents** are invoked through `buildAgent.ts` with `buildImplementPrompt()` which builds a custom prompt
3. **Classifier** is invoked inline in `adwPlanBuild.tsx::classifyIssue()` with a hardcoded prompt

The target state is:
- Plan agents use `/bug`, `/chore`, `/feature`, or `/pr_review` commands
- Build agents use `/implement` command
- Classifiers use `/classify_issue` command

The model should be passed as a parameter since different commands require different models (e.g., classifier uses `haiku`, plan/build use `opus`).

## Relevant Files
Use these files to resolve the chore:

- `adws/agents/claudeAgent.ts` - Contains the base `runClaudeAgent()` function that spawns the Claude CLI. Needs to be refactored to support slash command invocation instead of stdin prompts.
- `adws/agents/planAgent.ts` - Contains `runPlanAgent()` and `buildPlanPrompt()`. The prompt builder will be removed and the runner will use slash commands.
- `adws/agents/buildAgent.ts` - Contains `runBuildAgent()` and `buildImplementPrompt()`. The prompt builder will be removed and the runner will use slash commands.
- `adws/agents/index.ts` - Exports from agent modules. May need to remove prompt builder exports.
- `adws/adwPlanBuild.tsx` - Contains `classifyIssue()` which builds inline prompts. Needs to use `/classify_issue` command.
- `adws/adwPrReview.tsx` - Uses `runPrReviewPlanAgent()` and `runPrReviewBuildAgent()`. These need to use appropriate slash commands.
- `.claude/commands/classify_issue.md` - The `/classify_issue` command template.
- `.claude/commands/implement.md` - The `/implement` command template.
- `.claude/commands/feature.md` - The `/feature` command template for feature planning.
- `.claude/commands/bug.md` - The `/bug` command template for bug planning.
- `.claude/commands/chore.md` - The `/chore` command template for chore planning.
- `.claude/commands/pr_review.md` - The `/pr_review` command template for PR review planning.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create a New Command-Based Agent Runner in claudeAgent.ts

- Add a new function `runClaudeAgentWithCommand()` that invokes Claude CLI with a slash command
- The function signature should be:
  ```typescript
  export async function runClaudeAgentWithCommand(
    command: string,           // e.g., '/implement', '/feature', '/classify_issue'
    args: string,              // Arguments to pass to the command (replaces $ARGUMENTS)
    agentName: string,         // Human-readable name for logging
    outputFile: string,        // Path to write JSONL output
    model: string,             // Model to use ('opus', 'sonnet', 'haiku')
    onProgress?: ProgressCallback,
    statePath?: string
  ): Promise<AgentResult>
  ```
- The function should build the CLI invocation as:
  ```
  claude -p --verbose --dangerously-skip-permissions --output-format stream-json --model <model> "<command> '<args>'"
  ```
- Keep the existing `runClaudeAgent()` function for backwards compatibility during transition

### Step 2: Update Classifier to Use /classify_issue Command

- In `adws/adwPlanBuild.tsx`, update the `classifyIssue()` function
- Replace the inline prompt building with a call to `runClaudeAgentWithCommand()`
- Use command `/classify_issue` with the issue context as arguments
- Format the arguments to match what `classify_issue.md` expects:
  ```
  **Title:** ${issue.title}
  **Labels:** ${labelsText}

  ${issue.body || 'No description provided.'}
  ```
- Use model `haiku` for classification (fast and cost-effective)

### Step 3: Update Plan Agent to Use Planning Commands

- In `adws/agents/planAgent.ts`, update `runPlanAgent()` function
- Map the `issueType` parameter to the corresponding command:
  - `/feature` -> `/feature`
  - `/bug` -> `/bug`
  - `/chore` -> `/chore`
  - `/pr_review` -> `/pr_review`
- Format the arguments to include full issue context (issue number, title, state, author, labels, description, comments)
- Use model `opus` for planning (complex reasoning needed)
- Remove or deprecate `buildPlanPrompt()` function after verifying the new approach works

### Step 4: Update Build Agent to Use /implement Command

- In `adws/agents/buildAgent.ts`, update `runBuildAgent()` function
- Use command `/implement` with the plan file path as argument
- The argument should be the path to the plan file: `specs/issue-{number}-plan.md`
- Use model `opus` for implementation
- Remove or deprecate `buildImplementPrompt()` function after verifying the new approach works

### Step 5: Update PR Review Plan Agent

- In `adws/agents/planAgent.ts`, update `runPrReviewPlanAgent()` function
- Use command `/pr_review` with formatted PR and comment context as arguments
- Format arguments to include:
  - PR number, title, URL, branch
  - Original plan content
  - All review comments with file locations
- Use model `opus` for PR review planning
- Remove or deprecate `buildPrReviewPlanPrompt()` function

### Step 6: Update PR Review Build Agent

- In `adws/agents/buildAgent.ts`, update `runPrReviewBuildAgent()` function
- Use command `/implement` with the revision plan as argument
- Use model `opus` for implementation
- Remove or deprecate `buildPrReviewImplementPrompt()` function

### Step 7: Update Agent Module Exports

- In `adws/agents/index.ts`, update exports
- Export the new `runClaudeAgentWithCommand()` function
- Optionally mark or remove exports for deprecated prompt builders
- Ensure backwards compatibility for any external callers

### Step 8: Clean Up Deprecated Code

- Remove the following functions that are no longer needed:
  - `buildPlanPrompt()` from `planAgent.ts`
  - `buildImplementPrompt()` from `buildAgent.ts`
  - `buildPrReviewPlanPrompt()` from `planAgent.ts`
  - `buildPrReviewImplementPrompt()` from `buildAgent.ts`
- Remove the inline prompt from `classifyIssue()` in `adwPlanBuild.tsx`
- Update any tests that reference the removed functions

### Step 9: Run Validation Commands

- Execute all validation commands to ensure the refactoring is complete with zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions
- `npx tsx adws/healthCheck.tsx` - Run ADW health check to ensure agent infrastructure is working

## Notes

- **Model Selection**: Different agents require different models:
  - Classifier: `haiku` (fast, cost-effective for simple classification)
  - Plan agents: `opus` (complex reasoning and planning)
  - Build agents: `opus` (complex implementation and code generation)

- **Command Argument Format**: The slash commands expect arguments in a specific format based on their `$ARGUMENTS` placeholder. Care must be taken to format the arguments correctly for each command type.

- **Backwards Compatibility**: During the transition, both the old `runClaudeAgent()` and new `runClaudeAgentWithCommand()` functions should coexist. This allows for gradual migration and rollback if needed.

- **PR Review Workflow**: The PR review workflow (`adwPrReview.tsx`) also needs to be updated to use the new command-based invocation. This includes both the plan and build phases of PR review processing.

- **Testing Approach**: Since the ADW scripts interact with external services (GitHub, Claude CLI), integration testing should be done carefully. Consider testing with a known issue to verify end-to-end functionality.

- **State Management**: The existing state management and progress tracking mechanisms should continue to work with the new command-based invocation. No changes to `AgentStateManager` are needed.
