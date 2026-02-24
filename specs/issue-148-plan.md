# Feature: Token Limit Recovery for ADW Agents

## Feature Description
When an ADW agent (particularly during the build phase) consumes a large number of tokens on a complex feature, the Claude Code CLI can exceed its `MAX_THINKING_TOKENS` limit, causing the agent to stop abruptly and stall the workflow. This feature adds proactive token limit monitoring to detect when an agent is approaching the limit (90% of max), gracefully interrupt the current phase, save progress, and restart a new agent with the accumulated context so that the workflow can continue without manual intervention.

## User Story
As an ADW workflow operator
I want the ADW to automatically recover when a running agent approaches the token limit
So that large features can be implemented without manual intervention when the agent stalls due to token exhaustion

## Problem Statement
The Claude Code CLI has a maximum token budget (`MAX_THINKING_TOKENS`) for each agent session. When a particularly large feature is being implemented, token usage can exceed this limit, causing the agent to stop running and the entire ADW workflow to stall. There is currently no mechanism to detect this condition proactively and recover from it.

## Solution Statement
Add a token usage monitoring system that:
1. Tracks cumulative token usage in real-time as the Claude Code CLI streams JSONL output.
2. Computes the total token count (input + output + cache) from `modelUsage` data already available in the result messages.
3. When token usage exceeds 90% of `MAX_THINKING_TOKENS`, marks the current agent run as "token-limited" and returns the partial result.
4. The orchestrator detects the token-limit interruption, saves progress to agent state, posts a notification comment on the GitHub issue, and spawns a fresh agent with a continuation prompt that includes the previous agent's context and accumulated progress.
5. The cycle repeats until the agent completes naturally or exhausts a configurable maximum number of continuations.

The approach hooks into the existing `parseJsonlOutput` streaming parser in `claudeAgent.ts` and leverages the `ProgressCallback` mechanism and `AgentStateManager` state system already in place.

## Relevant Files
Use these files to implement the feature:

- `adws/core/config.ts` — Add `MAX_THINKING_TOKENS` and `TOKEN_LIMIT_THRESHOLD` (0.9) constants. This is where all workflow configuration lives.
- `adws/core/dataTypes.ts` — Add `TokenUsageSnapshot` interface and extend `AgentState` with `tokenUsage` field. Add `'token_limit_recovery'` to `WorkflowStage` type.
- `adws/core/costTypes.ts` — Reference for existing `ModelUsage` / `ModelUsageMap` types used for token tracking.
- `adws/core/index.ts` — Export new types and constants.
- `adws/agents/claudeAgent.ts` — Core change: add token tracking to the JSONL parser, detect threshold breaches, and gracefully terminate the agent when the limit is approached. Extend `AgentResult` with token-limit metadata.
- `adws/agents/buildAgent.ts` — Wrap `runBuildAgent` with a continuation loop that detects token-limit results and re-invokes with accumulated context.
- `adws/agents/index.ts` — Export new types.
- `adws/workflowPhases.ts` — Update `executeBuildPhase` (and optionally `executePlanPhase`) to handle token-limit recovery: save partial state, post recovery comment, and restart with context.
- `adws/github/workflowCommentsIssue.ts` — Add `formatTokenLimitRecoveryComment` for the `'token_limit_recovery'` stage. Add it to the `formatWorkflowComment` switch.
- `adws/github/workflowCommentsBase.ts` — Add `'token_limit_recovery'` to `STAGE_HEADER_MAP` for recovery state detection.
- `adws/__tests__/claudeAgent.test.ts` — New test file for token tracking and threshold detection in `parseJsonlOutput`.
- `adws/__tests__/tokenLimitRecovery.test.ts` — New test file for the end-to-end token limit recovery flow.
- `adws/__tests__/workflowPhases.test.ts` — Extend existing tests for the recovery path in `executeBuildPhase`.

### New Files
- `adws/__tests__/claudeAgent.test.ts` — Unit tests for token tracking in the JSONL parser.
- `adws/__tests__/tokenLimitRecovery.test.ts` — Integration tests for the full recovery loop.

## Implementation Plan
### Phase 1: Foundation
Add the configuration constants and type definitions needed for token limit tracking. This includes `MAX_THINKING_TOKENS`, `TOKEN_LIMIT_THRESHOLD`, and `MAX_TOKEN_CONTINUATIONS` in `config.ts`, the `TokenUsageSnapshot` interface in `dataTypes.ts`, and the new `'token_limit_recovery'` workflow stage. These are small, isolated changes that all subsequent work depends on.

### Phase 2: Core Implementation
Modify the `claudeAgent.ts` JSONL parser to accumulate token counts from each `result` message's `modelUsage` field. Add a helper function `computeTotalTokens(modelUsage: ModelUsageMap): number` that sums `inputTokens + outputTokens + cacheCreationInputTokens` across all models. When the running total exceeds `MAX_THINKING_TOKENS * TOKEN_LIMIT_THRESHOLD`, kill the child process (`claude.kill('SIGTERM')`) and resolve the promise with a new `tokenLimitExceeded: true` flag on `AgentResult`. Extend `AgentResult` with `tokenLimitExceeded`, `tokenUsage`, and `partialOutput` fields.

### Phase 3: Integration
Wire the token-limit recovery into the orchestrator layer. In `workflowPhases.ts`, wrap the build agent call in a continuation loop: when `buildResult.tokenLimitExceeded` is true, save the partial output and token snapshot to agent state, post a `'token_limit_recovery'` comment on the issue, construct a continuation prompt that includes the previous agent's output and instructions to continue from where it left off, and spawn a new build agent. Repeat until the agent completes normally or the maximum continuation count is reached. Add the corresponding comment formatter and stage mapping.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add configuration constants
- In `adws/core/config.ts`, add:
  - `MAX_THINKING_TOKENS`: parsed from `process.env.MAX_THINKING_TOKENS` with a default of `200000` (200k tokens — a conservative default that can be tuned per deployment).
  - `TOKEN_LIMIT_THRESHOLD`: parsed from `process.env.TOKEN_LIMIT_THRESHOLD` with a default of `0.9`.
  - `MAX_TOKEN_CONTINUATIONS`: parsed from `process.env.MAX_TOKEN_CONTINUATIONS` with a default of `3`.
- In `adws/core/index.ts`, export the three new constants.

### Step 2: Add type definitions
- In `adws/core/dataTypes.ts`:
  - Add `TokenUsageSnapshot` interface with fields: `totalInputTokens: number`, `totalOutputTokens: number`, `totalCacheCreationTokens: number`, `totalTokens: number`, `maxTokens: number`, `thresholdPercent: number`.
  - Add `'token_limit_recovery'` to the `WorkflowStage` union type.
  - Extend `AgentState` with an optional `tokenUsage?: TokenUsageSnapshot` field.
- In `adws/core/index.ts`, export the new `TokenUsageSnapshot` type.

### Step 3: Extend `AgentResult` and add token tracking to `claudeAgent.ts`
- In `adws/agents/claudeAgent.ts`:
  - Add `tokenLimitExceeded?: boolean`, `tokenUsage?: TokenUsageSnapshot`, and `partialOutput?: string` fields to the `AgentResult` interface.
  - Add a pure function `computeTotalTokens(modelUsage: ModelUsageMap): { inputTokens: number; outputTokens: number; cacheCreationTokens: number; total: number }` that sums token counts across all models in the map.
  - In the `parseJsonlOutput` function, when a `result` message is parsed and `modelUsage` is available, compute the running total tokens and store them on the `state` object.
  - In both `runClaudeAgent` and `runClaudeAgentWithCommand`, after each data chunk is parsed, check if the running total exceeds `MAX_THINKING_TOKENS * TOKEN_LIMIT_THRESHOLD`. If so:
    - Log the threshold breach.
    - Kill the child process with `claude.kill('SIGTERM')`.
    - Set a flag `tokenLimitReached = true`.
  - In the `close` handler, if `tokenLimitReached` is true, resolve with `{ success: true, tokenLimitExceeded: true, output: state.fullOutput, tokenUsage: snapshot, partialOutput: state.fullOutput, modelUsage: state.modelUsage, statePath }`.
- Export `computeTotalTokens` for testing.
- In `adws/agents/index.ts`, add `computeTotalTokens` to exports.

### Step 4: Write unit tests for token tracking
- Create `adws/__tests__/claudeAgent.test.ts`:
  - Test `computeTotalTokens` with single-model and multi-model usage maps.
  - Test that it returns `{ inputTokens, outputTokens, cacheCreationTokens, total }` correctly.
  - Test edge cases: empty map, zero values.

### Step 5: Add token limit recovery comment formatting
- In `adws/github/workflowCommentsIssue.ts`:
  - Add a `formatTokenLimitRecoveryComment(ctx: WorkflowContext)` function that produces a markdown comment with:
    - Header: `## :warning: Token Limit Recovery`
    - Body: continuation number, token usage details (used/max), ADW ID.
  - Add the `'token_limit_recovery'` case to the `formatWorkflowComment` switch statement.
- In `adws/github/workflowCommentsBase.ts`:
  - Add `':warning: Token Limit Recovery': 'token_limit_recovery'` to the `STAGE_HEADER_MAP`.

### Step 6: Add `WorkflowContext` fields for token recovery
- In `adws/github/workflowCommentsIssue.ts`, extend the `WorkflowContext` interface with:
  - `tokenContinuationNumber?: number` — which continuation attempt this is (1, 2, 3...).
  - `tokenUsage?: TokenUsageSnapshot` — the snapshot at the time of interruption.

### Step 7: Implement build phase token limit recovery loop in `workflowPhases.ts`
- In `executeBuildPhase`:
  - Wrap the existing build agent call in a `while` loop bounded by `MAX_TOKEN_CONTINUATIONS`.
  - After each `runBuildAgent` call, check `buildResult.tokenLimitExceeded`.
  - If true:
    - Save partial output and token snapshot to state via `AgentStateManager.writeState`.
    - Post a `'token_limit_recovery'` comment on the issue with the continuation number and token usage.
    - Construct a continuation prompt that includes:
      - The original plan content.
      - A summary of what the previous agent accomplished (from `buildResult.output`).
      - An instruction: "Continue implementing the plan from where the previous agent left off. Do NOT re-do work that was already completed."
    - Re-invoke `runBuildAgent` with the continuation prompt as the plan content.
    - Accumulate cost and model usage across continuations.
  - If the agent completes normally (`!tokenLimitExceeded`), break out of the loop.
  - If `MAX_TOKEN_CONTINUATIONS` is exhausted without completion, throw an error.

### Step 8: Write integration tests for token limit recovery
- Create `adws/__tests__/tokenLimitRecovery.test.ts`:
  - Mock `runClaudeAgentWithCommand` to simulate token limit being exceeded on first call and succeeding on second.
  - Verify the continuation prompt includes the previous output.
  - Verify the recovery comment is posted.
  - Verify costs are accumulated across continuations.
  - Test the max continuations exceeded error path.
- Extend `adws/__tests__/workflowPhases.test.ts`:
  - Add test cases for the `executeBuildPhase` token recovery loop.

### Step 9: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the feature works with zero regressions.

## Testing Strategy
### Unit Tests
- `computeTotalTokens`: Verify correct summation across single and multiple models. Test empty input, zero values, large numbers.
- `parseJsonlOutput` token accumulation: Verify that token counts are updated on each result message. Test that the threshold flag is set when the limit is exceeded.
- `formatTokenLimitRecoveryComment`: Verify the markdown output includes all required fields.

### Integration Tests
- Mock the full `executeBuildPhase` with a simulated token limit breach:
  - First call: agent returns `tokenLimitExceeded: true` with partial output.
  - Second call: agent completes successfully.
  - Assert: continuation prompt contains previous output, recovery comment posted, costs accumulated.
- Mock the max continuations exceeded scenario:
  - All calls return `tokenLimitExceeded: true`.
  - Assert: error is thrown after `MAX_TOKEN_CONTINUATIONS` attempts.

### Edge Cases
- Token usage exactly at 90% threshold — should trigger recovery.
- Token usage at 89.9% — should NOT trigger recovery.
- Agent completes on the very first run (no recovery needed) — existing behavior unchanged.
- `modelUsage` is undefined in the result message — gracefully handle, no crash.
- Multiple models in the usage map — all tokens summed correctly.
- `MAX_THINKING_TOKENS` set to 0 or negative via env — should disable the feature or use default.
- Agent is killed via SIGTERM but doesn't exit immediately — handle close event regardless.
- Continuation prompt exceeds reasonable size — truncate previous output to prevent prompt bloat.

## Acceptance Criteria
- When an ADW agent's cumulative token usage exceeds 90% of `MAX_THINKING_TOKENS`, the agent is gracefully terminated.
- The partial progress is saved to the agent state.
- A `token_limit_recovery` comment is posted on the GitHub issue with the continuation number and token usage snapshot.
- A new agent is spawned with a continuation prompt that includes the previous agent's output and an instruction to continue from where it left off.
- The workflow continues seamlessly and can complete the full build phase across multiple continuations.
- If `MAX_TOKEN_CONTINUATIONS` is exhausted, the workflow reports an error and stops.
- Costs and model usage are correctly accumulated across all continuations.
- Existing workflows that do not hit the token limit are completely unaffected (zero regression).
- All new code has unit tests with edge case coverage.
- All existing tests pass without modification.
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `MAX_THINKING_TOKENS` default of 200,000 is conservative. Operators can tune this via the `MAX_THINKING_TOKENS` environment variable.
- The continuation prompt should truncate the previous agent's output to a reasonable size (e.g., last 5,000 characters) to avoid prompt bloat in subsequent continuations.
- The `SIGTERM` approach for killing the agent is preferred over `SIGKILL` because it allows the Claude CLI to clean up gracefully.
- This feature is designed to be composable: while the initial implementation targets the build phase, the same pattern can be applied to plan, test, and review phases if needed in the future.
- Token tracking uses `inputTokens + outputTokens + cacheCreationInputTokens` as the total. `cacheReadInputTokens` are excluded because they represent cached data that doesn't count against the thinking budget.
- The `result` message type in Claude Code CLI output contains the cumulative `modelUsage` for the entire session, so each new `result` message provides the latest total — no manual accumulation across messages is needed.
