#!/usr/bin/env npx tsx
/**
 * ADW Plan, Build & Test - Plan+Build+Test+PR Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
 * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
 * 3. Build Phase: run build agent, commit implementation
 * 4. Test Phase: run unit tests with retry, run E2E tests with retry
 * 5. PR Phase: create pull request (only if all tests pass)
 * 6. Finalize: update state, post completion comment
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts for tests (default: 5)
 */

import { mergeModelUsageMaps, parseCliArguments } from './core';
import {
  initializeWorkflow,
  executePlanPhase,
  executeBuildPhase,
  executeTestPhase,
  executePRPhase,
  completeWorkflow,
  handleWorkflowError,
} from './workflowPhases';

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId } = parseCliArguments(args, 'adwPlanBuildTest.tsx');

  const config = await initializeWorkflow(issueNumber, providedAdwId, 'plan-build-test-orchestrator');

  try {
    const planResult = await executePlanPhase(config);
    const buildResult = await executeBuildPhase(config);
    const testResult = await executeTestPhase(config);
    executePRPhase(config);
    const totalModelUsage = mergeModelUsageMaps(planResult.modelUsage, buildResult.modelUsage, testResult.modelUsage);
    await completeWorkflow(config, planResult.costUsd + buildResult.costUsd + testResult.costUsd, {
      unitTestsPassed: testResult.unitTestsPassed,
      e2eTestsPassed: testResult.e2eTestsPassed,
      totalTestRetries: testResult.totalRetries,
    }, totalModelUsage);
  } catch (error) {
    handleWorkflowError(config, error);
  }
}

main();
