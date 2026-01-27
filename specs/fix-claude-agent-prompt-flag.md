# Bug: Claude agent uses invalid --prompt CLI flag

## Bug Description
The ADW workflow fails when running any Claude agent (Classifier, Plan, Build). The error is `unknown option '--prompt' (Did you mean --print?)`. The Claude CLI does not have a `--prompt` flag — the prompt is a positional argument or should be passed via stdin.

## Problem Statement
`adws/claudeAgent.ts` passes the prompt using `'--prompt', prompt` in the spawn args array (line 74). The Claude CLI does not support `--prompt`. This causes every agent invocation to fail with exit code 1.

## Solution Statement
Remove `'--prompt', prompt` from the args array and instead pipe the prompt to the spawned process via stdin. Using stdin is preferred over a positional argument because prompts can be very long and may exceed shell argument length limits.

## Steps to Reproduce
1. Run `npx tsx adws/adwPlanBuild.tsx 2`
2. Observe the error: `error: unknown option '--prompt' (Did you mean --print?)`
3. Both the Classifier and Plan agents fail with exit code 1

## Root Cause Analysis
In `adws/claudeAgent.ts` line 70-75, the `runClaudeAgent` function constructs CLI arguments including `'--prompt', prompt`. The Claude CLI (`claude`) accepts the prompt as a positional argument (`claude [options] [prompt]`) or via stdin, but does not have a `--prompt` option. This was likely a mistake during the initial implementation, confusing positional arguments with named options.

## Relevant Files
Use these files to fix the bug:

- `adws/claudeAgent.ts` — Contains the `runClaudeAgent` function that spawns the Claude CLI process with the invalid `--prompt` flag. This is the only file that needs to change.

## Step by Step Tasks

### 1. Fix the `--prompt` flag in `claudeAgent.ts`
- Open `adws/claudeAgent.ts`
- In the `runClaudeAgent` function (line 70-75), remove `'--prompt', prompt` from the `args` array
- After spawning the process, write the prompt to `claude.stdin` and close stdin:
  ```typescript
  claude.stdin.write(prompt);
  claude.stdin.end();
  ```
- This ensures prompts of any length are handled correctly

### 2. Validate the fix
- Run the validation commands below to confirm the fix works

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npx tsx adws/healthCheck.tsx` — Run the ADW health check to verify the agent can start
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The Claude CLI accepts prompts via stdin when using `--print` mode, which is already being used.
- No new libraries are needed.
- This is a one-line removal and two-line addition in a single file.
