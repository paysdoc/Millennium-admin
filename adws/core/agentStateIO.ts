/**
 * AgentStateIO - File I/O operations for ADW agent state management.
 *
 * Provides: writeState, readState, appendLog, writeRawOutput, readParentState, stateExists
 */

import * as fs from 'fs';
import * as path from 'path';
import { AGENTS_STATE_DIR } from './config';
import { AgentState } from './dataTypes';

const STATE_FILE = 'state.json';
const EXECUTION_LOG_FILE = 'execution.log';

function formatLogTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Writes agent state to state.json. Merges with existing state if present.
 */
export function writeState(statePath: string, state: Partial<AgentState>): void {
  const stateFile = path.join(statePath, STATE_FILE);
  let existingState: Partial<AgentState> = {};

  try {
    if (fs.existsSync(stateFile)) {
      const content = fs.readFileSync(stateFile, 'utf-8');
      existingState = JSON.parse(content);
    }
  } catch {
    existingState = {};
  }

  const mergedState = { ...existingState, ...state };
  fs.writeFileSync(stateFile, JSON.stringify(mergedState, null, 2), 'utf-8');
}

/**
 * Reads agent state from state.json.
 * @returns The parsed state object, or null if not found.
 */
export function readState(statePath: string): AgentState | null {
  const stateFile = path.join(statePath, STATE_FILE);
  try {
    if (!fs.existsSync(stateFile)) {
      return null;
    }
    const content = fs.readFileSync(stateFile, 'utf-8');
    return JSON.parse(content) as AgentState;
  } catch {
    return null;
  }
}

/**
 * Appends a message to the execution log. First entry includes the prompt if provided.
 */
export function appendLog(statePath: string, message: string, prompt?: string): void {
  const logFile = path.join(statePath, EXECUTION_LOG_FILE);
  const timestamp = formatLogTimestamp();
  let logEntry = '';

  const isFirstEntry = !fs.existsSync(logFile) || fs.statSync(logFile).size === 0;

  if (isFirstEntry && prompt) {
    logEntry = `=== Agent Execution Log ===\n`;
    logEntry += `Started: ${timestamp}\n\n`;
    logEntry += `=== Prompt ===\n${prompt}\n\n`;
    logEntry += `=== Execution Log ===\n`;
  }

  logEntry += `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logEntry, 'utf-8');
}

/**
 * Writes raw output data to a file. Supports JSON and JSONL formats.
 */
export function writeRawOutput(
  statePath: string,
  filename: string,
  data: unknown,
  append: boolean = false
): void {
  const outputFile = path.join(statePath, filename);

  if (filename.endsWith('.jsonl')) {
    const line = JSON.stringify(data) + '\n';
    if (append) {
      fs.appendFileSync(outputFile, line, 'utf-8');
    } else {
      fs.writeFileSync(outputFile, line, 'utf-8');
    }
  } else {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
  }
}

/**
 * Reads parent agent state by traversing up the directory tree.
 * @returns The parent agent's state, or null if not found.
 */
export function readParentState(statePath: string): AgentState | null {
  const parentPath = path.dirname(statePath);

  if (!parentPath.startsWith(AGENTS_STATE_DIR) || parentPath === AGENTS_STATE_DIR) {
    return null;
  }

  const parentState = readState(parentPath);
  if (parentState) {
    return parentState;
  }

  // If no state in immediate parent, try grandparent
  return readParentState(parentPath);
}

/**
 * Checks if state exists for an agent.
 * @returns True if state.json exists.
 */
export function stateExists(statePath: string): boolean {
  const stateFile = path.join(statePath, STATE_FILE);
  return fs.existsSync(stateFile);
}
