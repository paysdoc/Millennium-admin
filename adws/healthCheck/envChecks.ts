/**
 * Environment Variable Checks
 *
 * Validates that required and optional environment variables are present.
 * Uses functional array operations (filter/map) instead of for-loops.
 */

import type { CheckResult } from './healthCheckUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_ENV_VARS: readonly string[] = ['ANTHROPIC_API_KEY'];

const OPTIONAL_ENV_VARS: readonly string[] = [
  'CLAUDE_CODE_PATH',
  'GITHUB_PAT',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks required and optional environment variables.
 *
 * Returns a CheckResult indicating which variables are present, missing,
 * and which optional ones are set.
 */
export const checkEnvironmentVariables = (): CheckResult => {
  const present = REQUIRED_ENV_VARS.filter((v) => process.env[v]);
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  const optionalPresent = OPTIONAL_ENV_VARS.filter((v) => process.env[v]);

  const success = missing.length === 0;

  return {
    success,
    error:
      missing.length > 0
        ? `Missing required environment variables: ${missing.join(', ')}`
        : undefined,
    details: {
      required: present,
      missing,
      optional: optionalPresent,
    },
  };
};
