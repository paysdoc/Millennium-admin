#!/usr/bin/env npx tsx
/**
 * Vercel Environment Setup Script
 *
 * Usage: npx tsx adws/vercelEnvSetup.tsx
 *
 * Pushes Supabase environment variables from .env.local to Vercel environments.
 * Sets SUPABASE_URL, SUPABASE_KEY, and SUPABASE_SERVICE_KEY on development,
 * preview, and production environments.
 *
 * Prerequisites:
 * - Vercel CLI must be installed and accessible via VERCEL_CLI_PATH or in PATH
 * - User must be authenticated with Vercel (run 'vercel login' or set VERCEL_TOKEN)
 * - .env.local must exist with the required Supabase variables
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { VERCEL_CLI_PATH, log } from './core';

/** Target Vercel environments. */
const TARGET_ENVIRONMENTS = ['development', 'preview', 'production'] as const;

/** Environment variables to push to Vercel. */
const ENV_VARIABLES = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_KEY'] as const;

/**
 * Loads and parses the .env.local file.
 * @returns Parsed environment variables object.
 * @throws Error if file doesn't exist.
 */
function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local file not found. Please create it with the required Supabase variables.');
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const parsed = dotenv.parse(envContent);

  return parsed;
}

/**
 * Checks if the Vercel CLI is available and working.
 * @returns true if CLI is available, false otherwise.
 */
function checkVercelCli(): boolean {
  try {
    const version = execSync(`${VERCEL_CLI_PATH} --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    log(`Vercel CLI found: ${version}`, 'info');
    return true;
  } catch {
    log(`Vercel CLI not found at '${VERCEL_CLI_PATH}'. Please install it or set VERCEL_CLI_PATH.`, 'error');
    return false;
  }
}

/**
 * Checks if the user is authenticated with Vercel.
 * @returns true if authenticated, false otherwise.
 */
function checkVercelAuth(): boolean {
  try {
    const whoami = execSync(`${VERCEL_CLI_PATH} whoami`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    log(`Authenticated as: ${whoami}`, 'info');
    return true;
  } catch {
    log('Not authenticated with Vercel. Please run "vercel login" or set VERCEL_TOKEN.', 'error');
    return false;
  }
}

/**
 * Sets an environment variable in a Vercel environment.
 * @param name - Variable name.
 * @param value - Variable value.
 * @param environment - Target environment.
 * @returns true on success, false on failure.
 */
function setEnvVariable(name: string, value: string, environment: string): boolean {
  try {
    // Use echo to pipe the value to vercel env add
    // --force overwrites existing values, --yes skips confirmation
    execSync(`echo "${value}" | ${VERCEL_CLI_PATH} env add ${name} ${environment} --force --yes`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    log(`Set ${name} for ${environment}`, 'info');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed to set ${name} for ${environment}: ${message}`, 'error');
    return false;
  }
}

/**
 * Lists environment variables for a Vercel environment.
 * @param environment - Target environment.
 */
function listEnvVariables(environment: string): void {
  try {
    const output = execSync(`${VERCEL_CLI_PATH} env ls ${environment}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    log(`Environment variables for ${environment}:`, 'info');
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed to list variables for ${environment}: ${message}`, 'error');
  }
}

/**
 * Main function to orchestrate the environment setup.
 */
async function main(): Promise<void> {
  log('Starting Vercel environment setup...', 'info');
  console.log('');

  // Check Vercel CLI availability
  if (!checkVercelCli()) {
    process.exit(1);
  }

  // Check authentication
  if (!checkVercelAuth()) {
    process.exit(1);
  }

  // Load .env.local
  let envValues: Record<string, string>;
  try {
    envValues = loadEnvLocal();
    log('Loaded .env.local successfully', 'info');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(message, 'error');
    process.exit(1);
  }

  // Validate required variables exist
  const missingVars: string[] = [];
  for (const varName of ENV_VARIABLES) {
    if (!envValues[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    log(`Missing required variables in .env.local: ${missingVars.join(', ')}`, 'error');
    process.exit(1);
  }

  log('All required variables found in .env.local', 'info');
  console.log('');

  // Set variables for each environment
  let successCount = 0;
  let failureCount = 0;

  for (const environment of TARGET_ENVIRONMENTS) {
    log(`Setting variables for ${environment} environment...`, 'info');

    for (const varName of ENV_VARIABLES) {
      const value = envValues[varName];
      if (setEnvVariable(varName, value, environment)) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log('');
  }

  // Verify by listing variables
  log('Verifying environment variables...', 'info');
  console.log('');

  for (const environment of TARGET_ENVIRONMENTS) {
    listEnvVariables(environment);
  }

  // Summary
  console.log('='.repeat(60));
  log('Vercel Environment Setup Complete', 'info');
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failureCount}`);
  console.log('='.repeat(60));

  if (failureCount > 0) {
    log('Some variables failed to set. Please check the errors above.', 'error');
    process.exit(1);
  }

  log('All environment variables set successfully!', 'info');
  process.exit(0);
}

main();
