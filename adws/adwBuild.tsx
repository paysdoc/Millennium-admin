#!/usr/bin/env npx tsx
/**
 * ADW Build - AI Developer Workflow Implementation Phase
 *
 * Usage: npx tsx adws/adwBuild.tsx <github-issue-number> [adw-id] [--cwd <path>]
 *
 * Workflow:
 * 1. Fetch GitHub issue details
 * 2. Verify plan file exists
 * 3. Infer issue type from current branch
 * 4. Run Build Agent: Implement the solution
 * 5. Commit the implementation
 * 6. Create PR with full context
 *
 * Prerequisites:
 * - Must be on a feature/bugfix/chore branch created by adwPlan.tsx
 * - Plan file must exist at specs/issue-{number}.md
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import { parseCliArguments } from './core';
import { runBuildWorkflow } from './buildOrchestration';

/**
 * Main build workflow entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId, cwd } = parseCliArguments(args, 'adwBuild.tsx');

  await runBuildWorkflow(issueNumber, providedAdwId, cwd);
}

main();
