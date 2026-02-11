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
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuildTestReview.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete Plan+Build+Test+PR+Review workflow.');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY           - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH            - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  GITHUB_PAT                  - (Optional) GitHub Personal Access Token');
  console.error('  MAX_TEST_RETRY_ATTEMPTS     - Maximum retry attempts for tests (default: 5)');
  console.error('  MAX_REVIEW_RETRY_ATTEMPTS   - Maximum retry attempts for review (default: 3)');
  process.exit(1);
}

/**
 * Parses and validates command line arguments.
 */
function parseArguments(args: string[]): { issueNumber: number; adwId: string | null } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const adwId = args[1] || null;

  return { issueNumber, adwId };
}

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, adwId } = parseArguments(args);

  const config = await initializeWorkflow(issueNumber, adwId, 'plan-build-test-review-orchestrator');

  try {
    const planResult = await executePlanPhase(config);
    const buildResult = await executeBuildPhase(config);
    const testResult = await executeTestPhase(config);
    executePRPhase(config);
    const reviewResult = await executeReviewPhase(config);
    completeWorkflow(config, planResult.costUsd + buildResult.costUsd + testResult.costUsd + reviewResult.costUsd, {
      unitTestsPassed: testResult.unitTestsPassed,
      e2eTestsPassed: testResult.e2eTestsPassed,
      totalTestRetries: testResult.totalRetries,
      reviewPassed: reviewResult.reviewPassed,
      totalReviewRetries: reviewResult.totalRetries,
    });
  } catch (error) {
    handleWorkflowError(config, error);
  }
}

main();
