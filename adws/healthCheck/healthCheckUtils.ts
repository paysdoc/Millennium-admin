/**
 * Health Check Utilities - Shared types and helper functions.
 *
 * Provides the core types (CheckResult, HealthCheckResult) and
 * shell-command helpers used by all health check sub-modules.
 */

import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Individual check result.
 */
export interface CheckResult {
  success: boolean;
  error?: string;
  warning?: string;
  details: Record<string, unknown>;
}

/**
 * Structure for health check results.
 */
export interface HealthCheckResult {
  success: boolean;
  timestamp: string;
  checks: Record<string, CheckResult>;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a command exists in PATH.
 */
export const commandExists = (command: string): boolean => {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Executes a command and returns the trimmed output, or null on failure.
 */
export const execCommand = (command: string): string | null => {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Result aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Collects warnings and errors from all check results, and derives overall
 * success. Returns a new HealthCheckResult with the aggregated fields set.
 *
 * Uses functional iteration instead of for-loops.
 */
export const aggregateResults = (
  checks: Record<string, CheckResult>,
  timestamp: string,
): HealthCheckResult => {
  const entries = Object.entries(checks);

  const errors = entries
    .filter(([, r]) => r.error !== undefined)
    .map(([name, r]) => `${name}: ${r.error}`);

  const warnings = entries
    .filter(([, r]) => r.warning !== undefined)
    .map(([name, r]) => `${name}: ${r.warning}`);

  const success = entries.every(([, r]) => r.success);

  return { success, timestamp, checks, warnings, errors };
};
