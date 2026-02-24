# Feature: Track Agent Token Costs

## Feature Description
Add comprehensive token usage and cost tracking to the ADW (AI Developer Workflow) system. Every agent invocation already returns `totalCostUsd` from the Claude Code CLI, but the system currently only stores an aggregate total in metadata. This feature will:

1. Capture per-model token usage (input tokens, output tokens, cache read tokens, cache creation tokens) from the Claude CLI's `modelUsage` field in the JSONL result message.
2. Accumulate a per-agent and per-model cost breakdown throughout the workflow.
3. When a workflow completes (PR approved/rejected, or workflow error), post a GitHub issue comment showing the token breakdown per model and the total cost in USD and EUR (and any other configured currencies).
4. Use the free ExchangeRate-API (`https://open.er-api.com/v6/latest/USD`) for currency conversion, designed to be extensible for additional currencies.

## User Story
As a project administrator
I want to see the total tokens used and estimated API cost for each ADW workflow run
So that I can monitor and control AI development costs across issues

## Problem Statement
The ADW system uses multiple AI agents (plan, build, test, review, patch) that consume Claude API tokens. While the system already tracks aggregate `totalCostUsd`, there is no visibility into per-model token breakdowns or equivalent API costs. Project administrators have no way to understand cost distribution across agents or models, and costs are not reported in GitHub issue/PR comments where they would be most visible.

## Solution Statement
Extend the Claude agent runner to parse the `modelUsage` field from the CLI's JSONL result message, which provides per-model token breakdowns. Propagate this structured cost data through the workflow phases. Create a new `costReport` module that formats cost summaries and fetches exchange rates. Add cost summary comments to issue and PR completion workflows.

## Relevant Files
Use these files to implement the feature:

- `adws/core/dataTypes.ts` — Add new interfaces for token usage per model (`ModelUsage`, `CostBreakdown`). Extend `ClaudeCodeResultMessage` with `modelUsage` field.
- `adws/agents/claudeAgent.ts` — Parse `modelUsage` from the JSONL result. Return it in `AgentResult`.
- `adws/agents/testRetry.ts` — Accumulate `ModelUsage` maps across retry loops alongside `costUsd`.
- `adws/agents/reviewRetry.ts` — Accumulate `ModelUsage` maps across retry loops alongside `costUsd`.
- `adws/agents/index.ts` — Re-export new types from `claudeAgent.ts`.
- `adws/workflowPhases.ts` — Thread `ModelUsageMap` through each phase result. Merge usage maps in `completeWorkflow()` and `completePRReviewWorkflow()`. Pass cost data to comment formatters.
- `adws/github/workflowCommentsIssue.ts` — Add `costBreakdown` to `WorkflowContext`. Format cost table in `formatCompletedComment()` and `formatErrorComment()`.
- `adws/github/workflowCommentsPR.ts` — Add cost info to `formatPRReviewWorkflowComment()` for `pr_review_completed` and `pr_review_error` stages.
- `adws/github/index.ts` — Re-export new types/functions.
- `adws/core/index.ts` — Re-export new types.
- `adws/core/config.ts` — Add `COST_REPORT_CURRENCIES` configuration.
- `adws/adwPlanBuildTestReview.tsx` — Update cost aggregation to use new `ModelUsageMap`.
- `adws/adwPlanBuildTest.tsx` — Update cost aggregation.
- `adws/adwPlanBuild.tsx` — Update cost aggregation.
- `adws/adwPlan.tsx` — Update cost aggregation.
- `adws/adwBuild.tsx` — Update cost aggregation.
- `adws/adwTest.tsx` — Update cost aggregation.
- `adws/adwPrReview.tsx` — Update cost aggregation.

### New Files
- `adws/core/costTypes.ts` — Dedicated types for token usage and cost tracking (`ModelUsage`, `ModelUsageMap`, `CostBreakdown`, `CurrencyAmount`). Keeps `dataTypes.ts` focused and under 150 lines.
- `adws/core/costReport.ts` — Pure functions for merging `ModelUsageMap`s, computing cost from token counts using pricing data, formatting cost breakdown as markdown, and fetching exchange rates from ExchangeRate-API.
- `adws/core/costPricing.ts` — Static pricing data per model (cost per million input/output/cache tokens). Maps model identifiers to pricing tiers. Easy to update when Anthropic changes pricing.
- `adws/__tests__/costReport.test.ts` — Unit tests for cost computation, map merging, markdown formatting, and exchange rate fetching.
- `adws/__tests__/costPricing.test.ts` — Unit tests for pricing lookups and cost calculation.
- `adws/__tests__/costTypes.test.ts` — Unit tests for type guards and utility functions on cost types.

## Implementation Plan
### Phase 1: Foundation
1. Define cost-related types in `adws/core/costTypes.ts`:
   - `ModelUsage`: per-model token counts (inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD).
   - `ModelUsageMap`: `Record<string, ModelUsage>` keyed by model name.
   - `CurrencyAmount`: `{ currency: string; amount: number }`.
   - `CostBreakdown`: `{ totalCostUsd: number; modelUsage: ModelUsageMap; currencies: CurrencyAmount[] }`.
2. Define static pricing data in `adws/core/costPricing.ts` for current Claude models (opus, sonnet, haiku, and their full model IDs).
3. Create cost utility functions in `adws/core/costReport.ts`:
   - `mergeModelUsageMaps(...maps)` — Merges multiple `ModelUsageMap`s by summing fields.
   - `computeCostFromUsage(usage: ModelUsageMap)` — Computes total cost using pricing data (fallback to CLI-reported `costUSD` per model).
   - `fetchExchangeRates(baseCurrency: string, targetCurrencies: string[])` — Fetches rates from ExchangeRate-API.
   - `formatCostBreakdownMarkdown(breakdown: CostBreakdown)` — Returns a markdown table of token usage per model and total cost in each currency.

### Phase 2: Core Implementation
4. Extend `ClaudeCodeResultMessage` in `adws/core/dataTypes.ts` with optional `modelUsage` field.
5. Update `AgentResult` in `claudeAgent.ts` to include optional `modelUsage: ModelUsageMap`.
6. Update `parseJsonlOutput()` in `claudeAgent.ts` to extract `modelUsage` from the result message.
7. Return `modelUsage` in both `runClaudeAgent()` and `runClaudeAgentWithCommand()` agent results.
8. Update `TestRetryResult` and `ReviewRetryResult` to include `modelUsage: ModelUsageMap`.
9. Update retry loops in `testRetry.ts` and `reviewRetry.ts` to accumulate `ModelUsageMap` using `mergeModelUsageMaps()`.

### Phase 3: Integration
10. Update each workflow phase function in `workflowPhases.ts` to return `modelUsage` alongside `costUsd`.
11. Update `completeWorkflow()` to accept `CostBreakdown`, fetch exchange rates, store breakdown in state metadata, and pass it to the comment formatter.
12. Update `completePRReviewWorkflow()` similarly.
13. Add `costBreakdown` field to `WorkflowContext` and `PRReviewWorkflowContext`.
14. Update `formatCompletedComment()` to include cost breakdown markdown table.
15. Update `formatErrorComment()` to include partial cost breakdown if available.
16. Update `formatPRReviewWorkflowComment()` for completed/error stages.
17. Update all orchestrator entry points to pass `ModelUsageMap` through to `completeWorkflow()`.
18. Update barrel exports in `core/index.ts`, `agents/index.ts`, `github/index.ts`.

## Step by Step Tasks

### Step 1: Create cost type definitions
- Create `adws/core/costTypes.ts` with:
  - `ModelUsage` interface: `{ inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number; }`.
  - `ModelUsageMap` type: `Record<string, ModelUsage>`.
  - `CurrencyAmount` interface: `{ currency: string; amount: number; symbol: string; }`.
  - `CostBreakdown` interface: `{ totalCostUsd: number; modelUsage: ModelUsageMap; currencies: CurrencyAmount[]; }`.
  - `emptyModelUsage()` factory function returning a zero-valued `ModelUsage`.
  - `emptyModelUsageMap()` factory function returning an empty `ModelUsageMap`.
- Export all types from `adws/core/index.ts`.

### Step 2: Create pricing data module
- Create `adws/core/costPricing.ts` with:
  - `ModelPricing` interface: `{ inputPerMillion: number; outputPerMillion: number; cacheReadPerMillion: number; cacheCreationPerMillion: number; }`.
  - `MODEL_PRICING` constant: `Record<string, ModelPricing>` mapping model names/IDs to their pricing. Include entries for:
    - `claude-opus-4-6` / `opus`: $5.00 input, $25.00 output, $0.50 cache read, $6.25 cache creation.
    - `claude-sonnet-4-5-20250929` / `sonnet`: $3.00 input, $15.00 output, $0.30 cache read, $3.75 cache creation.
    - `claude-haiku-4-5-20251001` / `haiku`: $1.00 input, $5.00 output, $0.10 cache read, $1.25 cache creation.
  - `getModelPricing(modelName: string)` function that looks up pricing, falling back to sonnet pricing for unknown models.
  - `computeModelCost(modelName: string, usage: ModelUsage)` function that calculates USD cost from token counts.
- Export from `adws/core/index.ts`.

### Step 3: Create cost report utility module
- Create `adws/core/costReport.ts` with:
  - `mergeModelUsageMaps(...maps: ModelUsageMap[]): ModelUsageMap` — Merges multiple maps by summing corresponding fields per model key.
  - `computeTotalCostUsd(usageMap: ModelUsageMap): number` — Sums `costUSD` across all models, using API-reported cost (from Claude CLI) as the source of truth.
  - `fetchExchangeRates(targetCurrencies: string[]): Promise<Record<string, number>>` — Fetches exchange rates from `https://open.er-api.com/v6/latest/USD`. Returns a map of currency code to rate. Handles network errors gracefully by returning an empty map.
  - `buildCostBreakdown(usageMap: ModelUsageMap, currencies: string[]): Promise<CostBreakdown>` — Orchestrates fetching exchange rates and building the full `CostBreakdown` object.
  - `formatCostBreakdownMarkdown(breakdown: CostBreakdown): string` — Formats a markdown table showing per-model token usage and total cost in each currency. Table columns: Model | Input Tokens | Output Tokens | Cache Read | Cache Write | Cost (USD). Summary row at bottom with totals. Followed by a "Total Cost" section showing USD and all configured currencies.
  - `CURRENCY_SYMBOLS` constant: `Record<string, string>` mapping currency codes to symbols (USD → $, EUR → €, GBP → £, etc.).
- Export from `adws/core/index.ts`.

### Step 4: Write unit tests for cost modules
- Create `adws/__tests__/costTypes.test.ts`:
  - Test `emptyModelUsage()` returns all-zero fields.
  - Test `emptyModelUsageMap()` returns empty object.
- Create `adws/__tests__/costPricing.test.ts`:
  - Test `getModelPricing()` returns correct pricing for known models.
  - Test `getModelPricing()` returns sonnet fallback for unknown models.
  - Test `computeModelCost()` calculates correct cost for known token counts.
- Create `adws/__tests__/costReport.test.ts`:
  - Test `mergeModelUsageMaps()` correctly sums fields across multiple maps.
  - Test `mergeModelUsageMaps()` handles empty maps.
  - Test `mergeModelUsageMaps()` handles maps with different model keys.
  - Test `computeTotalCostUsd()` sums costs correctly.
  - Test `fetchExchangeRates()` handles network errors gracefully.
  - Test `fetchExchangeRates()` with mocked successful response.
  - Test `buildCostBreakdown()` constructs complete breakdown.
  - Test `formatCostBreakdownMarkdown()` produces expected markdown table.
  - Test `formatCostBreakdownMarkdown()` handles empty usage map.

### Step 5: Extend ClaudeCodeResultMessage and AgentResult
- In `adws/core/dataTypes.ts`:
  - Add optional field `modelUsage?: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number; }>` to `ClaudeCodeResultMessage` interface (using inline type to avoid circular deps with costTypes).
- In `adws/agents/claudeAgent.ts`:
  - Import `ModelUsageMap` from `../core`.
  - Add `modelUsage?: ModelUsageMap` field to `AgentResult` interface.
  - In `parseJsonlOutput()`, when `parsed.type === 'result'`, also extract `parsed.modelUsage` and store it on `state`.
  - Add `modelUsage` to the parse state type: `{ ..., modelUsage: ModelUsageMap | undefined }`.
  - In both `runClaudeAgent()` and `runClaudeAgentWithCommand()`, include `modelUsage` from `state.modelUsage` in the resolved `AgentResult`.
  - Log per-model token usage summary alongside the existing cost log line.

### Step 6: Update test retry to accumulate model usage
- In `adws/agents/testRetry.ts`:
  - Import `ModelUsageMap`, `mergeModelUsageMaps`, `emptyModelUsageMap` from `../core`.
  - Add `modelUsage: ModelUsageMap` to `TestRetryResult`.
  - In `runUnitTestsWithRetry()` and `runE2ETestsWithRetry()`, initialize `modelUsage = emptyModelUsageMap()` and merge each agent result's `modelUsage` using `mergeModelUsageMaps()`.
  - Return `modelUsage` in the result.

### Step 7: Update review retry to accumulate model usage
- In `adws/agents/reviewRetry.ts`:
  - Import `ModelUsageMap`, `mergeModelUsageMaps`, `emptyModelUsageMap` from `../core`.
  - Add `modelUsage: ModelUsageMap` to `ReviewRetryResult`.
  - In `runReviewWithRetry()`, initialize `modelUsage = emptyModelUsageMap()` and merge each agent result's `modelUsage`.
  - Return `modelUsage` in the result.

### Step 8: Update workflow phases to thread model usage
- In `adws/workflowPhases.ts`:
  - Import `ModelUsageMap`, `mergeModelUsageMaps`, `emptyModelUsageMap`, `buildCostBreakdown`, `formatCostBreakdownMarkdown` from `./core`.
  - Update `executePlanPhase()` return type to `{ costUsd: number; modelUsage: ModelUsageMap }`. Extract `modelUsage` from `planResult`.
  - Update `executeBuildPhase()` return type similarly.
  - Update `executeTestPhase()` return type to include `modelUsage: ModelUsageMap`.
  - Update `executeReviewPhase()` return type to include `modelUsage: ModelUsageMap`.
  - Update `completeWorkflow()` to accept a `ModelUsageMap` parameter. Build a `CostBreakdown` using `buildCostBreakdown()`. Store the full breakdown in state metadata. Set `ctx.costBreakdown` and call the comment formatter.
  - Update `completePRReviewWorkflow()` similarly — accumulate model usage from PR review plan/build/test phases and format cost comment.

### Step 9: Add cost breakdown to workflow comments
- In `adws/github/workflowCommentsIssue.ts`:
  - Import `CostBreakdown`, `formatCostBreakdownMarkdown` from `../core`.
  - Add `costBreakdown?: CostBreakdown` to `WorkflowContext`.
  - Update `formatCompletedComment()` to append a collapsible cost breakdown section using `formatCostBreakdownMarkdown()`.
  - Update `formatErrorComment()` to append partial cost breakdown if `ctx.costBreakdown` is available.
- In `adws/github/workflowCommentsPR.ts`:
  - Add `costBreakdown?: CostBreakdown` field via the inherited `WorkflowContext`.
  - Update `pr_review_completed` case to append cost breakdown.
  - Update `pr_review_error` case to append partial cost breakdown.

### Step 10: Update all orchestrator entry points
- In each orchestrator file (`adwPlan.tsx`, `adwBuild.tsx`, `adwTest.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlanBuildTestReview.tsx`, `adwPrReview.tsx`):
  - Extract `modelUsage` from each phase result.
  - Merge all phase `modelUsage` maps using `mergeModelUsageMaps()`.
  - Pass the merged map to `completeWorkflow()` or `completePRReviewWorkflow()`.

### Step 11: Update barrel exports
- In `adws/core/index.ts`: Export all types and functions from `costTypes.ts`, `costPricing.ts`, `costReport.ts`.
- In `adws/agents/index.ts`: Ensure `AgentResult` type with `modelUsage` is exported (already is).
- In `adws/github/index.ts`: No changes needed (types flow through `WorkflowContext`).

### Step 12: Add configuration for cost report currencies
- In `adws/core/config.ts`: Add `COST_REPORT_CURRENCIES` constant parsed from `process.env.COST_REPORT_CURRENCIES` (comma-separated, default: `'EUR'`).
- Export from `adws/core/index.ts`.

### Step 13: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the feature works with zero regressions.

## Testing Strategy
### Unit Tests
- `costTypes.test.ts`: Test factory functions (`emptyModelUsage`, `emptyModelUsageMap`).
- `costPricing.test.ts`: Test pricing lookups for known models, unknown model fallback, and cost computation accuracy.
- `costReport.test.ts`: Test map merging (empty, single, multiple, overlapping keys), total cost computation, exchange rate fetching (mock success and failure), cost breakdown building, and markdown formatting.

### Integration Tests
- Verify that `parseJsonlOutput()` correctly extracts `modelUsage` from a sample JSONL result line (extend existing `claudeAgent` test patterns if any).
- Verify that `completeWorkflow()` produces a comment containing the cost table by checking the formatted comment string.

### Edge Cases
- Agent result without `modelUsage` field (legacy Claude CLI versions) — should gracefully default to empty map, falling back to `totalCostUsd` only.
- Exchange rate API is unreachable — should still post cost comment with USD only, logging a warning.
- Empty `ModelUsageMap` (e.g., workflow with no agent invocations) — should produce a minimal cost section or omit it.
- Very large token counts — ensure no overflow in cost calculations (JavaScript numbers handle this fine up to 2^53).
- Unknown model names in `modelUsage` — fall back to sonnet pricing for per-token cost calculation, but prefer CLI-reported `costUSD` field.
- Multiple currencies configured via env var — should all appear in the cost summary.

## Acceptance Criteria
- Every agent invocation captures per-model token usage (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`) from the Claude CLI's `modelUsage` result field.
- Token usage is accumulated across all agents in a workflow run, broken down by model.
- When a workflow completes (success or failure), a GitHub comment is posted on the issue showing:
  - A table of token usage per model (input, output, cache read, cache write tokens).
  - Total cost in USD.
  - Total cost in EUR (and any other configured currencies) using the Free Exchange Rate API.
- When a PR review workflow completes (success or failure), a similar cost comment is posted on the PR.
- Exchange rate API failures are handled gracefully — USD cost is always shown; other currencies are omitted with a note if the API is unreachable.
- The system supports adding additional currencies via the `COST_REPORT_CURRENCIES` environment variable.
- All new code has unit tests with edge case coverage.
- All existing tests continue to pass (`npm test`).
- The application builds without errors (`npm run build`).
- The linter passes (`npm run lint`).

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The Claude Code CLI's JSONL result message includes a `modelUsage` field (available in recent CLI versions) that provides per-model token breakdowns. This is the authoritative source for token data. The `totalCostUsd` field on the result message remains the authoritative aggregate cost.
- The Free Exchange Rate API endpoint is `https://open.er-api.com/v6/latest/USD` — no API key required, no-auth, returns JSON with a `rates` object mapping currency codes to conversion factors. Rate limit: at most once per hour.
- Current Anthropic API pricing (as of Feb 2026):
  - **Opus 4.6**: $5.00/M input, $25.00/M output, $0.50/M cache read, $6.25/M cache creation
  - **Sonnet 4.5**: $3.00/M input, $15.00/M output, $0.30/M cache read, $3.75/M cache creation
  - **Haiku 4.5**: $1.00/M input, $5.00/M output, $0.10/M cache read, $1.25/M cache creation
- The pricing data should be easy to update when Anthropic releases new models or changes pricing — it lives in a single dedicated file (`costPricing.ts`).
- This feature is purely additive to the ADW system — it does not change any existing workflow logic, only enhances the information captured and reported.
- If the Claude CLI version does not include `modelUsage` in the result, the system falls back gracefully to using only `totalCostUsd` from the result message (existing behavior).
