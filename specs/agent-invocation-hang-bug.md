# Bug: Agent Invocation Causes Process to Hang Indefinitely

## Bug Description
Attempting to run any Claude agent (classifier, plan, build) causes the process to hang indefinitely. The `adwPlanBuild.tsx` workflow stops at the classification stage and never completes. This affects all agent invocations that use `runClaudeAgentWithCommand()` which passes the prompt as a positional CLI argument.

**Symptoms:**
- Process hangs with no output
- No errors are logged
- The Claude CLI is spawned but never completes
- CPU usage is low (process is blocked, not spinning)

**Expected behavior:** Agent should execute the prompt and return within a reasonable time (typically 2-30 seconds depending on complexity).

**Actual behavior:** Process hangs indefinitely until manually killed.

## Problem Statement
The `runClaudeAgentWithCommand()` function in `adws/agents/claudeAgent.ts` spawns the Claude CLI using Node.js `spawn()` without configuring the `stdio` option. By default, `spawn()` creates pipes for stdin, stdout, and stderr (`stdio: ['pipe', 'pipe', 'pipe']`). When the prompt is passed as a positional CLI argument (not via stdin), the Claude CLI process still waits for stdin to be closed before fully initializing. Since the parent process never closes stdin, the child process hangs indefinitely.

## Solution Statement
Configure the `stdio` option in the `spawn()` call within `runClaudeAgentWithCommand()` to ignore stdin since the prompt is passed as a positional argument: `stdio: ['ignore', 'pipe', 'pipe']`. This tells Node.js not to create a pipe for stdin, allowing the Claude CLI to run without waiting for stdin input.

The `runClaudeAgent()` function that passes prompts via stdin should continue to use the default behavior (or explicitly set `stdio: ['pipe', 'pipe', 'pipe']`) and must close stdin after writing the prompt.

## Steps to Reproduce
1. Run any agent invocation that uses `runClaudeAgentWithCommand()`:
   ```bash
   npx tsx adws/adwPlanBuild.tsx 2
   ```
2. Observe the process hangs at "Classifying issue type..."
3. The process never progresses past the classification stage
4. Must manually kill the process with Ctrl+C

Alternatively, the minimal reproduction:
```javascript
const { spawn } = require('child_process');
const p = spawn('claude', [
  '--print',
  '--dangerously-skip-permissions',
  '--model', 'haiku',
  'Hello'
], { cwd: process.cwd() });
// Process hangs indefinitely
```

## Root Cause Analysis
The root cause is a mismatch between how stdin is configured and how the prompt is provided:

1. **`runClaudeAgentWithCommand()`** passes the prompt as the last positional argument to the Claude CLI
2. **Node.js `spawn()`** by default creates a pipe for stdin (`stdio: ['pipe', 'pipe', 'pipe']`)
3. **Claude CLI** in `--print` mode expects either:
   - stdin to be closed/ignored (when prompt is a positional argument), OR
   - stdin to contain the prompt and then be closed (when no positional prompt)
4. Since stdin is connected as a pipe but never closed, the Claude CLI waits indefinitely

The working bash script (`/Users/martin/claude-print.sh`) doesn't have this issue because bash doesn't create an open pipe for stdin when calling commands - it either connects stdin to the terminal or to `/dev/null` depending on the context.

**The fix:** When passing prompt as a positional argument, ignore stdin: `stdio: ['ignore', 'pipe', 'pipe']`

## Relevant Files
Use these files to fix the bug:

- `adws/agents/claudeAgent.ts` - Contains both `runClaudeAgent()` and `runClaudeAgentWithCommand()` functions that spawn the Claude CLI. The `runClaudeAgentWithCommand()` function at line 319 needs the `stdio` option added to the spawn call.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix `runClaudeAgentWithCommand()` in claudeAgent.ts

- Open `adws/agents/claudeAgent.ts`
- Locate the `runClaudeAgentWithCommand()` function (starts at line 283)
- Find the `spawn()` call at line 319:
  ```typescript
  const claude = spawn(CLAUDE_CODE_PATH, cliArgs, {
    cwd: process.cwd(),
    env: { ...process.env }
  });
  ```
- Add the `stdio` option to ignore stdin:
  ```typescript
  const claude = spawn(CLAUDE_CODE_PATH, cliArgs, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  ```

### Step 2: Verify `runClaudeAgent()` handles stdin correctly

- In the same file, verify that `runClaudeAgent()` (starts at line 143) correctly handles stdin
- Confirm that lines 178-179 properly write the prompt and close stdin:
  ```typescript
  claude.stdin.write(prompt);
  claude.stdin.end();
  ```
- This function should continue to work as-is since it needs stdin to be a pipe

### Step 3: Run Validation Commands

- Execute all validation commands to verify the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions
- `npx tsx adws/healthCheck.tsx 2` - Run ADW health check to verify infrastructure works

### Test the fix manually (optional but recommended)

After applying the fix, test manually with a simple invocation:
```bash
node -e "
const { spawn } = require('child_process');
const p = spawn('claude', [
  '--print',
  '--dangerously-skip-permissions',
  '--model', 'haiku',
  'Hello, respond with just OK'
], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});
p.stdout.on('data', d => console.log('OUT:', d.toString()));
p.on('close', code => console.log('Exit:', code));
"
```

Expected output:
```
OUT: OK
Exit: 0
```

## Notes

- The fix is minimal: adding a single line (`stdio: ['ignore', 'pipe', 'pipe']`) to the spawn options
- This fix only affects `runClaudeAgentWithCommand()` which passes the prompt as a CLI argument
- `runClaudeAgent()` continues to work correctly because it properly writes to and closes stdin
- The root cause is not a Claude CLI bug - it's the expected behavior when stdin is connected as a pipe but never used/closed
- No new libraries are needed
