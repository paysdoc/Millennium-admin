/**
 * Utility functions for the webhook trigger server.
 *
 * Provides HTTP response helpers and process spawning utilities
 * used by the main webhook server and event handlers.
 */

import * as http from 'http';
import { spawn } from 'child_process';
import { log } from '../core';

const HTTP_STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
};

/**
 * Sends a JSON response with the given status code and body.
 * Logs an error message for 4xx/5xx status codes.
 */
export function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  if (statusCode >= 400) {
    const description = HTTP_STATUS_DESCRIPTIONS[statusCode] || 'Error';
    log(`HTTP ${statusCode} ${description}: ${JSON.stringify(body)}`, 'error');
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Spawns a detached child process that continues running
 * after the parent exits.
 */
export function spawnDetached(command: string, args: string[]): void {
  log(`Spawning: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    detached: true,
    stdio: 'inherit',
  });
  child.unref();
}
