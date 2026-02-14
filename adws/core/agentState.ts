/**
 * AgentStateManager - File-based state management for ADW agents.
 *
 * Provides methods to:
 * - Initialize state directories for agents
 * - Write and read structured state (state.json)
 * - Append to execution logs (execution.log)
 * - Write raw output files (JSON/JSONL)
 * - Read parent agent state for shared context
 */

import * as fs from 'fs';
import * as path from 'path';
import { AGENTS_STATE_DIR } from './config';
import { AgentIdentifier, AgentState, AgentExecutionState } from './dataTypes';

/**
 * State file names used by the state manager.
 */
const STATE_FILE = 'state.json';
const EXECUTION_LOG_FILE = 'execution.log';

/**
 * Formats a timestamp for log entries.
 */
function formatLogTimestamp(): string {
  return new Date().toISOString();
}

/**
 * AgentStateManager handles all file-based state operations for ADW agents.
 */
export class AgentStateManager {
  /**
   * Initializes the state directory for an agent.
   * Creates the directory structure: agents/{adwId}/{agentIdentifier}/
   * For nested agents: agents/{adwId}/{parentAgent}/{agentIdentifier}/
   *
   * @param adwId - The ADW session identifier
   * @param agentIdentifier - The agent's identifier
   * @param parentAgentPath - Optional parent agent's state path for nested agents
   * @returns The full path to the agent's state directory
   */
  static initializeState(
    adwId: string,
    agentIdentifier: AgentIdentifier,
    parentAgentPath?: string
  ): string {
    let statePath: string;

    if (parentAgentPath) {
      // Nested agent: create directory under parent
      statePath = path.join(parentAgentPath, agentIdentifier);
    } else {
      // Top-level agent: create under agents/{adwId}/
      statePath = path.join(AGENTS_STATE_DIR, adwId, agentIdentifier);
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(statePath)) {
      fs.mkdirSync(statePath, { recursive: true });
    }

    return statePath;
  }

  /**
   * Writes agent state to state.json.
   * Merges with existing state if present.
   *
   * @param statePath - The agent's state directory path
   * @param state - The state object to write
   */
  static writeState(statePath: string, state: Partial<AgentState>): void {
    const stateFile = path.join(statePath, STATE_FILE);
    let existingState: Partial<AgentState> = {};

    // Read existing state if present
    try {
      if (fs.existsSync(stateFile)) {
        const content = fs.readFileSync(stateFile, 'utf-8');
        existingState = JSON.parse(content);
      }
    } catch {
      // If reading/parsing fails, start with empty state
      existingState = {};
    }

    // Merge states - new state takes precedence
    const mergedState = { ...existingState, ...state };

    // Write merged state
    fs.writeFileSync(stateFile, JSON.stringify(mergedState, null, 2), 'utf-8');
  }

  /**
   * Reads agent state from state.json.
   *
   * @param statePath - The agent's state directory path
   * @returns The parsed state object, or null if not found
   */
  static readState(statePath: string): AgentState | null {
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
   * Appends a message to the execution log.
   * First entry includes the prompt if provided.
   *
   * @param statePath - The agent's state directory path
   * @param message - The log message to append
   * @param prompt - Optional prompt to include (for first entry)
   */
  static appendLog(statePath: string, message: string, prompt?: string): void {
    const logFile = path.join(statePath, EXECUTION_LOG_FILE);
    const timestamp = formatLogTimestamp();
    let logEntry = '';

    // Check if this is the first entry
    const isFirstEntry = !fs.existsSync(logFile) || fs.statSync(logFile).size === 0;

    if (isFirstEntry && prompt) {
      // Include prompt in first entry
      logEntry = `=== Agent Execution Log ===\n`;
      logEntry += `Started: ${timestamp}\n\n`;
      logEntry += `=== Prompt ===\n${prompt}\n\n`;
      logEntry += `=== Execution Log ===\n`;
    }

    logEntry += `[${timestamp}] ${message}\n`;

    fs.appendFileSync(logFile, logEntry, 'utf-8');
  }

  /**
   * Writes raw output data to a file.
   * Supports JSON and JSONL formats.
   *
   * @param statePath - The agent's state directory path
   * @param filename - The output filename (e.g., 'output.jsonl')
   * @param data - The data to write (will be JSON-serialized)
   * @param append - Whether to append (for JSONL) or overwrite
   */
  static writeRawOutput(
    statePath: string,
    filename: string,
    data: unknown,
    append: boolean = false
  ): void {
    const outputFile = path.join(statePath, filename);

    if (filename.endsWith('.jsonl')) {
      // JSONL format: one JSON object per line
      const line = JSON.stringify(data) + '\n';
      if (append) {
        fs.appendFileSync(outputFile, line, 'utf-8');
      } else {
        fs.writeFileSync(outputFile, line, 'utf-8');
      }
    } else {
      // Regular JSON format
      fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
    }
  }

  /**
   * Reads parent agent state by traversing up the directory tree.
   *
   * @param statePath - The current agent's state directory path
   * @returns The parent agent's state, or null if not found
   */
  static readParentState(statePath: string): AgentState | null {
    // Get parent directory
    const parentPath = path.dirname(statePath);

    // Check if we've reached the agents directory (no more parents)
    if (!parentPath.startsWith(AGENTS_STATE_DIR) || parentPath === AGENTS_STATE_DIR) {
      return null;
    }

    // Try to read state from parent
    const parentState = this.readState(parentPath);

    if (parentState) {
      return parentState;
    }

    // If no state in immediate parent, try grandparent
    return this.readParentState(parentPath);
  }

  /**
   * Creates an initial execution state.
   *
   * @param status - The initial status (defaults to 'running')
   * @returns A new AgentExecutionState object
   */
  static createExecutionState(status: AgentExecutionState['status'] = 'running'): AgentExecutionState {
    return {
      status,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates execution state to mark completion.
   *
   * @param execution - The existing execution state
   * @param success - Whether the execution was successful
   * @param errorMessage - Optional error message if failed
   * @returns Updated execution state
   */
  static completeExecution(
    execution: AgentExecutionState,
    success: boolean,
    errorMessage?: string
  ): AgentExecutionState {
    return {
      ...execution,
      status: success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      errorMessage: success ? undefined : errorMessage,
    };
  }

  /**
   * Gets the state directory path without creating it.
   * Useful for reading state.
   *
   * @param adwId - The ADW session identifier
   * @param agentIdentifier - The agent's identifier
   * @param parentAgentPath - Optional parent agent's state path for nested agents
   * @returns The full path to the agent's state directory
   */
  static getStatePath(
    adwId: string,
    agentIdentifier: AgentIdentifier,
    parentAgentPath?: string
  ): string {
    if (parentAgentPath) {
      return path.join(parentAgentPath, agentIdentifier);
    }
    return path.join(AGENTS_STATE_DIR, adwId, agentIdentifier);
  }

  /**
   * Checks if state exists for an agent.
   *
   * @param statePath - The agent's state directory path
   * @returns True if state.json exists
   */
  static stateExists(statePath: string): boolean {
    const stateFile = path.join(statePath, STATE_FILE);
    return fs.existsSync(stateFile);
  }

  /**
   * Checks if a process with the given PID is alive.
   * Uses `process.kill(pid, 0)` which checks existence without sending a signal.
   *
   * @param pid - The process ID to check
   * @returns True if the process is alive
   */
  static isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Finds the orchestrator state path for a given ADW ID.
   * Scans `agents/{adwId}/` for a subdirectory whose state.json
   * contains an agent name ending in `-orchestrator`.
   *
   * @param adwId - The ADW session identifier
   * @returns The orchestrator state directory path, or null if not found
   */
  static findOrchestratorStatePath(adwId: string): string | null {
    const adwDir = path.join(AGENTS_STATE_DIR, adwId);

    if (!fs.existsSync(adwDir)) return null;

    try {
      const entries = fs.readdirSync(adwDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const statePath = path.join(adwDir, entry.name);
        const state = this.readState(statePath);

        if (state?.agentName?.endsWith('-orchestrator')) {
          return statePath;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Checks if the agent process for a given ADW ID is still running.
   * Locates the orchestrator state, reads the PID, and checks OS liveness.
   *
   * @param adwId - The ADW session identifier
   * @returns True if the agent process is alive, false otherwise
   */
  static isAgentProcessRunning(adwId: string): boolean {
    const statePath = this.findOrchestratorStatePath(adwId);
    if (!statePath) return false;

    const state = this.readState(statePath);
    if (!state?.pid) return false;

    return this.isProcessAlive(state.pid);
  }
}

// Export utility functions for convenience
export const initializeAgentState = AgentStateManager.initializeState;
export const writeAgentState = AgentStateManager.writeState;
export const readAgentState = AgentStateManager.readState;
export const appendAgentLog = AgentStateManager.appendLog;
export const writeAgentRawOutput = AgentStateManager.writeRawOutput;
export const readParentAgentState = AgentStateManager.readParentState;
export const isProcessAlive = AgentStateManager.isProcessAlive;
export const findOrchestratorStatePath = AgentStateManager.findOrchestratorStatePath.bind(AgentStateManager);
export const isAgentProcessRunning = AgentStateManager.isAgentProcessRunning.bind(AgentStateManager);
