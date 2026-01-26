/**
 * Utility functions for ADW Plan & Build workflow.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LOGS_DIR } from './config';

/**
 * Generates a unique ADW session identifier.
 * Format: adw-{timestamp}-{random}
 */
export function generateAdwId(): string {
  return `adw-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Converts text to URL-friendly slug.
 * Removes special characters, converts to lowercase, limits to 50 chars.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

export type LogLevel = 'info' | 'error' | 'success';

const LOG_PREFIXES: Record<LogLevel, string> = {
  info: '\u{1F4CB}',
  error: '\u{274C}',
  success: '\u{2705}'
};

/**
 * Logs a message with timestamp and emoji prefix.
 */
export function log(message: string, level: LogLevel = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = LOG_PREFIXES[level];
  console.log(`${prefix} [${timestamp}] ${message}`);
}

/**
 * Ensures the logs directory exists for a given ADW session.
 * Creates the directory if it doesn't exist.
 * @returns The path to the session logs directory.
 */
export function ensureLogsDirectory(adwId: string): string {
  const sessionDir = path.join(LOGS_DIR, adwId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}
