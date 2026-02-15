/**
 * Configuration constants for ADW Plan & Build workflow.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file at project root
dotenv.config();

/** Path to the Claude CLI executable. */
export const CLAUDE_CODE_PATH = process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude';

/** GitHub Personal Access Token (optional, gh CLI handles auth). */
export const GITHUB_PAT = process.env.GITHUB_PAT || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

/** Directory for storing workflow logs. */
export const LOGS_DIR = path.join(process.cwd(), 'logs');

/** Directory for storing implementation plans. */
export const SPECS_DIR = path.join(process.cwd(), 'specs');

/** Directory for storing agent state files. */
export const AGENTS_STATE_DIR = path.join(process.cwd(), 'agents');

/** Maximum number of retry attempts for test resolution. */
export const MAX_TEST_RETRY_ATTEMPTS = parseInt(process.env.MAX_TEST_RETRY_ATTEMPTS || '5', 10);

/** Maximum number of retry attempts for review-patch resolution. */
export const MAX_REVIEW_RETRY_ATTEMPTS = parseInt(process.env.MAX_REVIEW_RETRY_ATTEMPTS || '3', 10);

/** Directory for storing git worktrees. */
export const WORKTREES_DIR = path.join(process.cwd(), '.worktrees');

/** Currencies to include in cost reports (comma-separated env var, default: EUR). */
export const COST_REPORT_CURRENCIES: readonly string[] = (process.env.COST_REPORT_CURRENCIES || 'EUR')
  .split(',')
  .map(c => c.trim())
  .filter(Boolean);

/** Maximum token budget per agent session (default: 200,000). */
export const MAX_THINKING_TOKENS = Math.max(0, parseInt(process.env.MAX_THINKING_TOKENS || '200000', 10)) || 200000;

/** Fraction of MAX_THINKING_TOKENS at which to trigger recovery (default: 0.9). */
export const TOKEN_LIMIT_THRESHOLD = parseFloat(process.env.TOKEN_LIMIT_THRESHOLD || '0.9') || 0.9;

/** Maximum number of continuation attempts before failing (default: 3). */
export const MAX_TOKEN_CONTINUATIONS = Math.max(1, parseInt(process.env.MAX_TOKEN_CONTINUATIONS || '3', 10)) || 3;
