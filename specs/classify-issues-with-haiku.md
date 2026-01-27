# Chore: Classify issues with Haiku before planning

## Chore Description
Update `adwPlanBuild.tsx` to classify GitHub issues by type (feature, bug, or chore) using the `haiku` model before running the plan agent. Currently the plan agent hardcodes the `/feature` command format. After this change, the workflow will first classify the issue using haiku (cheap and fast), then pass the correct slash command to the plan agent so it uses the appropriate plan template (`/feature`, `/bug`, or `/chore`).

## Relevant Files
Use these files to resolve the chore:

- `adws/adwPlanBuild.tsx` — Main workflow orchestrator. Needs a classification step added between fetching the issue and running the plan agent.
- `adws/planAgent.ts` — Plan agent that builds the prompt. Currently hardcodes `/feature` command. Must accept the classified issue type and use the corresponding command format.
- `adws/claudeAgent.ts` — Claude agent runner. Already supports the `model` parameter. Will be used for the classification call.
- `adws/dataTypes.ts` — Contains `IssueClassSlashCommand` type (`'/chore' | '/bug' | '/feature'`) which should be used for the classification result.
- `.claude/commands/classify_issue.md` — Existing classify_issue command template that defines how to classify issues. Use its prompt structure as reference for building the classification prompt.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add classifyIssue function to adwPlanBuild.tsx
- Import `IssueClassSlashCommand` from `./dataTypes`.
- Import `runClaudeAgent` from `./claudeAgent`.
- Create a `classifyIssue` function that:
  - Takes a `GitHubIssue` and `logsDir: string` as parameters.
  - Returns `Promise<IssueClassSlashCommand>`.
  - Builds a classification prompt using the issue title, body, and labels (mirror the logic from `.claude/commands/classify_issue.md`).
  - Calls `runClaudeAgent` with model `'haiku'`, agent name `'Classifier'`, and output file `path.join(logsDir, 'classifier-agent.jsonl')`.
  - Parses the output to extract the slash command (`/feature`, `/bug`, or `/chore`).
  - Defaults to `/feature` if classification fails or returns `0`.

### 2. Update planAgent.ts to accept issue type
- Update `buildPlanPrompt` to accept a second parameter `issueType: IssueClassSlashCommand`.
- Replace the hardcoded `Use the /feature command format` instruction with `Use the ${issueType} command format`.
- Update `runPlanAgent` to accept `issueType: IssueClassSlashCommand` and pass it to `buildPlanPrompt`.

### 3. Wire classification into the main workflow in adwPlanBuild.tsx
- After fetching the issue (Step 1) and before creating the feature branch (Step 2), add a classification step:
  - Call `classifyIssue(issue, logsDir)`.
  - Log the classification result.
- Pass the classification result to `runPlanAgent(issue, logsDir, issueType)`.
- Update the commit message in Step 3 (plan commit) to use the classified type instead of hardcoded `chore:`. Map: `/feature` → `feat:`, `/bug` → `fix:`, `/chore` → `chore:`.

### 4. Run Validation Commands

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Type-check the adws TypeScript files

## Notes
- The `haiku` model is used for classification because it's fast and cheap — classification is a simple task.
- The `IssueClassSlashCommand` type already exists in `dataTypes.ts` and constrains values to `/chore`, `/bug`, or `/feature`.
- The `.claude/commands/classify_issue.md` command already exists and defines the classification logic. We replicate its prompt in code rather than invoking it as a slash command, since we're running headless via the Claude CLI.
