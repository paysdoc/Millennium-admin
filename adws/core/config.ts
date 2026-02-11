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
