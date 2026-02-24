# Chore: Adopt tac-6 ADWS patterns

## Metadata
issueNumber: `163`
adwId: `72kwzy`
issueJson: ``

## Chore Description
Adopt five proven patterns from the tac-6 (Python) ADWS system into the Millennium-admin (TypeScript) ADWS system. These are security, observability, and maintainability improvements:

1. **Subprocess environment whitelist** - Stop forwarding every env var to Claude CLI subprocesses. Build an explicit allowlist so only the variables Claude actually needs are passed through.
2. **Prompt file saving** - Save each prompt sent to Claude as a standalone `.txt` file for replay and audit purposes.
3. **Centralized model routing map** - Replace hard-coded model string literals scattered across 8 agent files with a single `SLASH_COMMAND_MODEL_MAP` dictionary.
4. **Health check API endpoint** - Expose a `GET /health` HTTP endpoint in the webhook server so system health can be checked without SSH access.
5. **State design cleanup** - Remove the `tokenUsage` top-level field from `AgentState` and move it into the `metadata` bag where it belongs.

## Relevant Files
Use these files to resolve the chore:

### Env whitelist
- `adws/core/config.ts` - Add `getSafeSubprocessEnv()` function here alongside existing config constants
- `adws/agents/claudeAgent.ts` - Two `spawn()` calls at lines 225-228 and 286-289 currently pass `env: { ...process.env }`
- `adws/core/index.ts` - Re-export the new function

### Prompt saving
- `adws/agents/claudeAgent.ts` - Add `savePrompt()` function and call it from both `runClaudeAgent()` and `runClaudeAgentWithCommand()`

### Model routing map
- `adws/core/issueTypes.ts` - Extend `SlashCommand` type to include all used commands (currently missing `/test`, `/test_e2e`, `/resolve_failed_test`, `/resolve_failed_e2e_test`, `/review`, `/patch`, `/document`)
- `adws/core/config.ts` - Add `SLASH_COMMAND_MODEL_MAP` constant
- `adws/core/index.ts` - Re-export the map
- `adws/agents/planAgent.ts` - Replace hard-coded `'opus'` at lines 154 and 178 with map lookups
- `adws/agents/buildAgent.ts` - Replace hard-coded `'opus'` at lines 64 and 97 with map lookups
- `adws/agents/testAgent.ts` - Replace hard-coded `'sonnet'` (lines 87, 130) and `'opus'` (lines 177, 217) with map lookups
- `adws/agents/reviewAgent.ts` - Replace hard-coded `'opus'` at line 73 with map lookup
- `adws/agents/patchAgent.ts` - Replace hard-coded `'opus'` at line 59 with map lookup
- `adws/agents/prAgent.ts` - Replace hard-coded `'sonnet'` at line 70 with map lookup
- `adws/agents/documentAgent.ts` - Replace hard-coded `'sonnet'` at line 63 with map lookup
- `adws/agents/gitAgent.ts` - Replace hard-coded `'sonnet'` at lines 89 and 154 with map lookups

### Health endpoint
- `adws/triggers/trigger_webhook.ts` - Add `GET /health` route before the `/webhook` check
- `adws/healthCheckChecks.ts` - Import check functions from here
- `adws/healthCheck.tsx` - Reference for `HealthCheckResult` interface (import or duplicate)

### State cleanup
- `adws/core/agentTypes.ts` - Remove `tokenUsage` from `AgentState` interface (line 154)
- `adws/phases/buildPhase.ts` - Change line 111 from `tokenUsage: buildResult.tokenUsage` to `metadata: { tokenUsage: buildResult.tokenUsage }`
- `adws/github/workflowCommentsIssue.ts` - No changes needed; `WorkflowContext.tokenUsage` is separate from `AgentState.tokenUsage`
- `adws/__tests__/tokenLimitRecovery.test.ts` - Update test at line 281 that asserts `tokenUsage` as a top-level field in `AgentStateManager.writeState` calls
- `adws/__tests__/workflowPhases.test.ts` - Similar assertion update near line 488 if it checks `AgentState.tokenUsage`

### Guidelines
- `guidelines/coding_guidelines.md` - Must follow coding guidelines throughout

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Extend `SlashCommand` type in `core/issueTypes.ts`

- Open `adws/core/issueTypes.ts`
- Replace the current `SlashCommand` type (lines 98-111) with the extended version that includes all actually-used commands:
  ```typescript
  export type SlashCommand =
    // Issue classification commands
    | '/chore'
    | '/bug'
    | '/feature'
    | '/pr_review'
    // ADW workflow commands
    | '/classify_adw'
    | '/classify_issue'
    | '/find_plan_file'
    | '/generate_branch_name'
    | '/commit'
    | '/pull_request'
    | '/implement'
    // Test commands
    | '/test'
    | '/test_e2e'
    | '/resolve_failed_test'
    | '/resolve_failed_e2e_test'
    // Review and patch commands
    | '/review'
    | '/patch'
    // Documentation
    | '/document';
  ```

### Step 2: Add `getSafeSubprocessEnv()` to `core/config.ts`

- Open `adws/core/config.ts`
- Add the following function after the existing constants:
  ```typescript
  /** Allowlist of environment variable names safe to pass to Claude CLI subprocesses. */
  const SAFE_ENV_VARS: readonly string[] = [
    'ANTHROPIC_API_KEY',
    'GITHUB_PAT',
    'GH_TOKEN',
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'CLAUDE_CODE_PATH',
    'HOME',
    'USER',
    'PATH',
    'SHELL',
    'TERM',
    'LANG',
    'LC_ALL',
    'NODE_PATH',
    'NODE_ENV',
    'PWD',
  ];

  /**
   * Builds a filtered environment object containing only whitelisted variables.
   * Prevents leaking secrets (DB credentials, AWS keys, etc.) to Claude CLI subprocesses.
   */
  export function getSafeSubprocessEnv(): Record<string, string> {
    const safeEnv: Record<string, string> = {};
    for (const key of SAFE_ENV_VARS) {
      const value = process.env[key];
      if (value !== undefined) {
        safeEnv[key] = value;
      }
    }
    return safeEnv;
  }
  ```

### Step 3: Add `SLASH_COMMAND_MODEL_MAP` to `core/config.ts`

- In the same file `adws/core/config.ts`, import `SlashCommand` from `./issueTypes`
- Add the model routing map after the `getSafeSubprocessEnv()` function:
  ```typescript
  import type { SlashCommand } from './issueTypes';

  /** Centralized model routing map. Maps every slash command to its model. */
  export const SLASH_COMMAND_MODEL_MAP: Record<SlashCommand, 'opus' | 'sonnet' | 'haiku'> = {
    // Classification (fast, cheap)
    '/classify_adw': 'haiku',
    '/classify_issue': 'haiku',
    // Planning (complex reasoning)
    '/feature': 'opus',
    '/bug': 'opus',
    '/chore': 'opus',
    '/pr_review': 'opus',
    // Implementation (complex reasoning)
    '/implement': 'opus',
    '/patch': 'opus',
    // Review (complex reasoning)
    '/review': 'opus',
    // Test running (structured, cheap)
    '/test': 'sonnet',
    '/test_e2e': 'sonnet',
    // Test resolution (complex reasoning)
    '/resolve_failed_test': 'opus',
    '/resolve_failed_e2e_test': 'opus',
    // Git operations (structured, cheap)
    '/generate_branch_name': 'sonnet',
    '/commit': 'sonnet',
    '/pull_request': 'sonnet',
    // Documentation
    '/document': 'sonnet',
    // Utility
    '/find_plan_file': 'sonnet',
  };
  ```

### Step 4: Update `core/index.ts` to re-export new symbols

- Open `adws/core/index.ts`
- Add `getSafeSubprocessEnv` and `SLASH_COMMAND_MODEL_MAP` to the config re-exports line (line 6):
  ```typescript
  export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR, AGENTS_STATE_DIR, MAX_TEST_RETRY_ATTEMPTS, MAX_REVIEW_RETRY_ATTEMPTS, WORKTREES_DIR, COST_REPORT_CURRENCIES, MAX_THINKING_TOKENS, TOKEN_LIMIT_THRESHOLD, MAX_TOKEN_CONTINUATIONS, getSafeSubprocessEnv, SLASH_COMMAND_MODEL_MAP } from './config';
  ```

### Step 5: Update `claudeAgent.ts` - env whitelist and prompt saving

- Open `adws/agents/claudeAgent.ts`
- Add `getSafeSubprocessEnv` to the import from `'../core'` (line 6)
- Add `import * as path from 'path';` at the top (needed for prompt saving path operations)
- Add the `savePrompt()` helper function before `runClaudeAgent()`:
  ```typescript
  /**
   * Saves the prompt to a file in the agent's state directory for replay and audit.
   * Extracts the slash command name from the prompt start for the filename.
   */
  function savePrompt(prompt: string, statePath: string): void {
    const promptsDir = path.join(statePath, 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });

    const match = prompt.match(/^\/(\w+)/);
    const filename = match ? `${match[1]}.txt` : 'prompt.txt';

    fs.writeFileSync(path.join(promptsDir, filename), prompt, 'utf-8');
  }
  ```
- In `runClaudeAgent()` (line 206 area), add `savePrompt(prompt, statePath)` inside the existing `if (statePath)` block
- In `runClaudeAgentWithCommand()` (line 265 area), add `savePrompt(prompt, statePath)` inside the existing `if (statePath)` block
- Replace `env: { ...process.env }` on line 227 with `env: getSafeSubprocessEnv()`
- Replace `env: { ...process.env },` on line 288 with `env: getSafeSubprocessEnv(),`

### Step 6: Update agent files to use `SLASH_COMMAND_MODEL_MAP`

For each agent file, import `SLASH_COMMAND_MODEL_MAP` from `'../core'` and replace the hard-coded model string with a map lookup. The pattern is:

Replace `'opus'` or `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/command_name']` where `/command_name` is the slash command being invoked.

- **`adws/agents/planAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 154: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/pr_review']`
  - Line ~178 (`runPlanAgent`): The model is derived from `issueType` param (an `IssueClassSlashCommand`). Replace the hard-coded `'opus'` with `SLASH_COMMAND_MODEL_MAP[issueType]`

- **`adws/agents/buildAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 64: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/implement']`
  - Line 97: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/implement']`

- **`adws/agents/testAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 87: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/test']`
  - Line 130: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/test_e2e']`
  - Line 177: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/resolve_failed_test']`
  - Line 217: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/resolve_failed_e2e_test']`

- **`adws/agents/reviewAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 73: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/review']`

- **`adws/agents/patchAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 59: Replace `'opus'` with `SLASH_COMMAND_MODEL_MAP['/patch']`

- **`adws/agents/prAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 70: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/pull_request']`

- **`adws/agents/documentAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 63: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/document']`

- **`adws/agents/gitAgent.ts`**:
  - Import `SLASH_COMMAND_MODEL_MAP` from `'../core'`
  - Line 89: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/generate_branch_name']`
  - Line 154: Replace `'sonnet'` with `SLASH_COMMAND_MODEL_MAP['/commit']`

### Step 7: Add `GET /health` endpoint to `trigger_webhook.ts`

- Open `adws/triggers/trigger_webhook.ts`
- Add imports for health check functions:
  ```typescript
  import {
    checkEnvironmentVariables,
    checkGitRepository,
    checkClaudeCodeCLI,
    checkGitHubCLI,
    checkDirectoryStructure,
  } from '../healthCheckChecks';
  ```
- Define the `HealthCheckResult` interface (or import from `healthCheck.tsx`):
  ```typescript
  interface HealthCheckResult {
    success: boolean;
    timestamp: string;
    checks: Record<string, import('../healthCheckChecks').CheckResult>;
    warnings: string[];
    errors: string[];
  }
  ```
- In the `http.createServer` callback, replace the current `if (req.url !== '/webhook')` check (lines 53-56) with:
  ```typescript
  if (req.url === '/health' && req.method === 'GET') {
    const result: HealthCheckResult = {
      success: true,
      timestamp: new Date().toISOString(),
      checks: {},
      warnings: [],
      errors: [],
    };

    result.checks.environmentVariables = checkEnvironmentVariables();
    result.checks.gitRepository = checkGitRepository();
    result.checks.claudeCodeCLI = checkClaudeCodeCLI();
    result.checks.gitHubCLI = checkGitHubCLI();
    result.checks.directoryStructure = checkDirectoryStructure();

    for (const [checkName, checkResult] of Object.entries(result.checks)) {
      if (checkResult.error) {
        result.errors.push(`${checkName}: ${checkResult.error}`);
      }
      if (checkResult.warning) {
        result.warnings.push(`${checkName}: ${checkResult.warning}`);
      }
      if (!checkResult.success) {
        result.success = false;
      }
    }

    jsonResponse(res, 200, result as unknown as Record<string, unknown>);
    return;
  }

  if (req.url !== '/webhook') {
    jsonResponse(res, 404, { error: 'not found' });
    return;
  }
  ```

### Step 8: Remove `tokenUsage` from `AgentState` interface

- Open `adws/core/agentTypes.ts`
- Remove the `tokenUsage?: TokenUsageSnapshot;` field (line 154) and its comment (line 153) from the `AgentState` interface
- Keep the `metadata?: Record<string, unknown>;` field (it's already there)
- Keep `TokenUsageSnapshot` exported (it's still used in `AgentResult` and `WorkflowContext`)

### Step 9: Update `buildPhase.ts` to write `tokenUsage` into `metadata`

- Open `adws/phases/buildPhase.ts`
- At line 111, change the partial state write from:
  ```typescript
  tokenUsage: buildResult.tokenUsage,
  ```
  to:
  ```typescript
  metadata: { tokenUsage: buildResult.tokenUsage },
  ```

### Step 10: Update tests for state cleanup

- Open `adws/__tests__/tokenLimitRecovery.test.ts`
- At line 278-285, the test asserts `AgentStateManager.writeState` was called with `tokenUsage` as a top-level field. Update to assert it's inside `metadata`:
  ```typescript
  expect(AgentStateManager.writeState).toHaveBeenCalledWith(
    '/mock/state/path',
    expect.objectContaining({
      metadata: expect.objectContaining({
        tokenUsage: expect.objectContaining({
          totalTokens: 180000,
        }),
      }),
    })
  );
  ```

- Open `adws/__tests__/workflowPhases.test.ts` and check if there's a similar assertion that references `tokenUsage` at top level in an `AgentState` write. If so, update it the same way. The reference near line 488 is in mock return values for `runBuildAgent()` (which returns `AgentResult`, not `AgentState`), so the `tokenUsage` field there should NOT change -- it's correct as-is since `AgentResult` still has `tokenUsage` at top level.

### Step 11: Run validation commands

- Run `npm run lint` to verify code quality
- Run `npm run build` to verify no build errors
- Run `npx vitest run --config adws/vitest.config.ts` to run the ADWS test suite and confirm zero regressions
- Run `npm test` to run the full test suite

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx vitest run --config adws/vitest.config.ts` - Run ADWS-specific tests to validate all five changes
- `npm test` - Run full test suite to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `tokenUsage` field on `AgentResult` (in `claudeAgent.ts`) must NOT be removed -- only the one on `AgentState` (in `agentTypes.ts`). The `WorkflowContext.tokenUsage` in `workflowCommentsIssue.ts` is also separate and must remain.
- The `SLASH_COMMAND_MODEL_MAP` uses the `SlashCommand` type as its key, so extending the type first (Step 1) is a prerequisite for Step 3.
- The `savePrompt()` function is intentionally a simple fire-and-forget file write. No need for error handling beyond what `fs.writeFileSync` provides -- a failure here should not block agent execution. If desired, wrap in try/catch with a `log()` warning.
- For the health endpoint, we skip `checkIssueNumber()` because it requires an argument and is not relevant for a general health probe.
- The `HealthCheckResult` interface is defined locally in `trigger_webhook.ts` rather than imported from `healthCheck.tsx` to avoid pulling in the CLI script's dependencies. This is a deliberate duplication for decoupling.
- When updating agent files for model map lookups, the `import` statement should add `SLASH_COMMAND_MODEL_MAP` to the existing `'../core'` import rather than creating a new import line.
