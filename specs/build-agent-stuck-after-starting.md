# Bug: Build Agent Gets Stuck After Starting

## Bug Description
In the ADW (AI Developer Workflow) flow, the workflow gets stuck after the message 'Starting Build agent...' is logged. The Build Agent process is spawned but does not produce any output or make progress, causing the entire workflow to hang indefinitely. This occurs at the implementation stage after the Plan Agent has successfully completed and the plan file has been committed.

**Symptoms:**
- Workflow proceeds normally through classification, branch creation, and planning stages
- "Starting Build agent..." message appears in logs
- No further output or progress is made
- The process hangs without error messages or timeout

**Expected behavior:**
- Build Agent should read the implementation plan and implement the solution
- Progress messages should appear as Claude works through the implementation
- Implementation should complete with a summary of changes made

**Actual behavior:**
- Build Agent starts but produces no output
- Workflow hangs indefinitely after "Starting Build agent..." log message

## Problem Statement
The Build Agent's prompt instructs Claude to "Use the /implement command with the plan path to execute the implementation." However, this instruction is problematic for several reasons:

1. The prompt is sent via stdin to Claude CLI in `--print` mode, where slash commands behave differently than in interactive mode
2. The prompt contradicts itself by first telling Claude to "Read the implementation plan" and "Follow the plan step-by-step" (direct action), then saying to use the `/implement` command (indirect action)
3. The `/implement` command expects plan content as `$ARGUMENTS`, but the prompt suggests passing a file path instead

This ambiguity causes Claude to either:
- Wait for clarification on what action to take
- Attempt to invoke the slash command in a way that doesn't work in `--print` mode
- Get stuck in an unclear state

## Solution Statement
Refactor the Build Agent to receive the plan content directly in the prompt, following the same pattern as the Plan Agent which receives issue context inline.

**Key architectural change:** The ADW flow orchestrator (`adwPlanBuild.tsx`) should read the plan file content and pass it to the Build Agent, rather than having the agent read it from a file path. This is the same pattern used for the Plan Agent, where the flow reads the issue data and passes it inline.

The fix involves:

1. **`adwPlanBuild.tsx`** - Read the plan file content before calling `runBuildAgent()` and pass the content as a parameter
2. **`buildAgent.ts`** - Update `runBuildAgent()` and `buildImplementPrompt()` to accept and include the plan content directly in the prompt
3. Remove the reference to the `/implement` slash command which doesn't work in `--print` mode
4. Add clear, direct implementation instructions that don't rely on Claude reading external files

## Steps to Reproduce
1. Create a GitHub issue (or use an existing one)
2. Run the ADW workflow: `npx tsx adws/adwPlanBuild.tsx <issue-number>`
3. Wait for the workflow to progress through:
   - Issue classification
   - Branch creation
   - Plan Agent (creates implementation plan)
   - Plan commit
4. Observe the "Starting Build agent..." log message
5. Notice the workflow hangs with no further progress

## Root Cause Analysis
The root cause is in `adws/buildAgent.ts` in the `buildImplementPrompt` function:

```typescript
export function buildImplementPrompt(issue: GitHubIssue, planPath: string): string {
  return `You are a Build Agent. Your job is to implement the solution based on the implementation plan.
...
Use the /implement command with the plan path to execute the implementation.
...`;
}
```

The instruction "Use the /implement command" does not work correctly when:
1. Claude is invoked with `--print` mode via `runClaudeAgent()`
2. The prompt is sent via stdin
3. There's no interactive session context for slash command handling

The Plan Agent works because it doesn't rely on slash commands for its core functionality - it directly instructs Claude to create a plan file using the issue context provided in the prompt.

Additionally, the `runClaudeAgent` function in `claudeAgent.ts` does not read or include the plan file content, leaving Claude without the actual plan to implement.

## Relevant Files
Use these files to fix the bug:

- **`adws/adwPlanBuild.tsx`** - The workflow orchestrator that calls `runBuildAgent()`. This file should read the plan file content and pass it to the Build Agent (similar to how it passes issue data to the Plan Agent). Modify the call at line ~332 to read the plan content first.

- **`adws/buildAgent.ts`** - Contains `runBuildAgent()` and `buildImplementPrompt()` functions. Update the function signatures to accept `planContent: string` and include it directly in the prompt.

- **`adws/planAgent.ts`** - Reference file showing the correct pattern. The `formatIssueContext()` function formats data inline in the prompt, and `buildPlanPrompt()` embeds this content directly. Follow this same pattern for the Build Agent.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Update adwPlanBuild.tsx to Read Plan Content
The workflow orchestrator should read the plan file and pass its content to the Build Agent.

**File:** `adws/adwPlanBuild.tsx`

**Changes:**
- Add `import * as fs from 'fs';` at the top of the file (it's not currently imported)
- Before calling `runBuildAgent()` at line ~332, read the plan file content:
  ```typescript
  // Read plan content to pass to Build Agent
  const planContent = fs.readFileSync(planPath, 'utf-8');
  const buildResult = await runBuildAgent(issue, logsDir, planContent);
  ```
- Add error handling if the plan file cannot be read

### 2. Update runBuildAgent Function Signature
**File:** `adws/buildAgent.ts`

**Changes:**
- Update the function signature to accept `planContent`:
  ```typescript
  export async function runBuildAgent(
    issue: GitHubIssue,
    logsDir: string,
    planContent: string
  ): Promise<AgentResult>
  ```
- Pass `planContent` to `buildImplementPrompt()`:
  ```typescript
  const prompt = buildImplementPrompt(issue, planContent);
  ```
- Remove the `getPlanFilePath` call since we no longer need the path

### 3. Refactor buildImplementPrompt Function
**File:** `adws/buildAgent.ts`

**Changes:**
- Update function signature to accept `planContent: string` instead of `planPath: string`
- Remove the `/implement` command reference
- Include the plan content directly in the prompt
- New prompt structure:

```typescript
export function buildImplementPrompt(issue: GitHubIssue, planContent: string): string {
  return `You are a Build Agent. Your job is to implement the solution based on the implementation plan below.

## GitHub Issue #${issue.number}
**Title:** ${issue.title}
**URL:** ${issue.url}

## Implementation Plan
${planContent}

## Instructions

1. Follow the implementation plan step-by-step
2. Make all necessary code changes as specified in the plan
3. Run the validation commands from the plan to verify correctness
4. Ensure all tests pass and there are no regressions

## After Implementation
Provide a summary of:
- What was implemented
- Files changed/created
- Validation results
- Any issues encountered and how they were resolved

IMPORTANT: Follow the plan exactly. Run validation commands to verify the implementation.`;
}
```

### 4. Add Error Handling for Missing Plan File
**File:** `adws/adwPlanBuild.tsx`

**Changes:**
- Wrap the plan file read in a try-catch
- If the file cannot be read, throw a descriptive error that will be caught by the main error handler:
  ```typescript
  let planContent: string;
  try {
    planContent = fs.readFileSync(planPath, 'utf-8');
  } catch (error) {
    throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
  }
  ```

### 5. Run Validation Commands
- Execute `npm run lint` to check for code quality issues
- Execute `npm run build` to verify no build errors
- Execute `npm test` to validate the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- **Pattern consistency**: This fix aligns the Build Agent with the Plan Agent pattern, where the workflow orchestrator reads data and passes it inline to the agent prompt. This is the correct architecture for Claude CLI in `--print` mode.

- **Testing the fix**: After implementing the fix, test by running the ADW workflow on a simple issue to verify the Build Agent no longer hangs and successfully implements the solution.

- **Plan file format**: The plan files in `specs/` follow a consistent markdown format. The fix should work with any properly formatted plan file.

- **Alternative approach considered**: Using the Claude CLI with `--resume` or different flags was considered but rejected because the core issue is the prompt content, not the CLI invocation method.

- **Backward compatibility**: This change modifies the `runBuildAgent` function signature (adds `planContent` parameter), so the call site in `adwPlanBuild.tsx` must be updated accordingly.

- **No new dependencies**: The fix only requires using the built-in `fs` module (needs to be imported in `adwPlanBuild.tsx`).
