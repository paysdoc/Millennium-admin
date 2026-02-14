#!/usr/bin/env npx tsx
/**
 * ADW Test - AI Developer Workflow Testing Phase
 *
 * Usage: npx tsx adws/adwTest.tsx [adw-id] [--cwd <path>]
 *
 * Workflow:
 * 1. Run unit tests using /test command (sonnet model)
 * 2. If tests fail, run /resolve_failed_test for each failure (opus model)
 * 3. Retry unit tests after resolution
 * 4. Discover and run E2E tests using /test_e2e command (sonnet model)
 * 5. If E2E tests fail, run /resolve_failed_e2e_test for each failure (opus model)
 * 6. Retry E2E tests after resolution
 * 7. Continue until all tests pass or MAX_TEST_RETRY_ATTEMPTS exceeded
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts (default: 5)
 */

import { parseTestArguments } from './core';
import { runTestWorkflow } from './testOrchestration';

/** Main test workflow entry point. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { adwId, cwd } = parseTestArguments(args, 'adwTest.tsx');

  await runTestWorkflow(adwId, cwd);
}

main();
