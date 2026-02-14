#!/usr/bin/env npx tsx
/**
 * ADW Plan, Build, Test & Review - Plan+Build+Test+PR+Review Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuildTestReview.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
 * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
 * 3. Build Phase: run build agent, commit implementation
 * 4. Test Phase: run unit tests with retry, run E2E tests with retry
 * 5. PR Phase: create pull request (only if all tests pass)
 * 6. Review Phase: review implementation against spec, patch blockers, retry
 * 7. Finalize: update state, post completion comment
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts for tests (default: 5)
 * - MAX_REVIEW_RETRY_ATTEMPTS: Maximum retry attempts for review-patch loop (default: 3)
 */

import { mergeModelUsageMaps, parseCliArguments } from './core';
import {
  initializeWorkflow,
  executePlanPhase,
  executeBuildPhase,
  executeTestPhase,
  executePRPhase,
  executeReviewPhase,
  completeWorkflow,
  handleWorkflowError,
} from './workflowPhases';

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId } = parseCliArguments(args, 'adwPlanBuildTestReview.tsx');

  const config = await initializeWorkflow(issueNumber, providedAdwId, 'plan-build-test-review-orchestrator');

  try {
    const planResult = await executePlanPhase(config);
    const buildResult = await executeBuildPhase(config);
    const testResult = await executeTestPhase(config);
    executePRPhase(config);
    const reviewResult = await executeReviewPhase(config);
    const totalModelUsage = mergeModelUsageMaps(planResult.modelUsage, buildResult.modelUsage, testResult.modelUsage, reviewResult.modelUsage);
    await completeWorkflow(config, planResult.costUsd + buildResult.costUsd + testResult.costUsd + reviewResult.costUsd, {
      unitTestsPassed: testResult.unitTestsPassed,
      e2eTestsPassed: testResult.e2eTestsPassed,
      totalTestRetries: testResult.totalRetries,
      reviewPassed: reviewResult.reviewPassed,
      totalReviewRetries: reviewResult.totalRetries,
    }, totalModelUsage);
  } catch (error) {
    handleWorkflowError(config, error);
  }
}

main();
