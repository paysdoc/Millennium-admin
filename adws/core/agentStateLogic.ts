/**
 * AgentStateLogic - State computation logic for ADW agent state management.
 *
 * Provides methods to:
 * - Initialize state directories for agents
 * - Create initial execution state
 * - Mark execution as complete
 * - Compute state directory paths
 */

import * as fs from 'fs';
import * as path from 'path';
import { AGENTS_STATE_DIR } from './config';
import { AgentIdentifier, AgentExecutionState } from './dataTypes';

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
export function initializeState(
  adwId: string,
  agentIdentifier: AgentIdentifier,
  parentAgentPath?: string
): string {
  const statePath = parentAgentPath
    ? path.join(parentAgentPath, agentIdentifier)
    : path.join(AGENTS_STATE_DIR, adwId, agentIdentifier);

  // Create directory if it doesn't exist
  if (!fs.existsSync(statePath)) {
    fs.mkdirSync(statePath, { recursive: true });
  }

  return statePath;
}

/**
 * Creates an initial execution state.
 *
 * @param status - The initial status (defaults to 'running')
 * @returns A new AgentExecutionState object
 */
export function createExecutionState(status: AgentExecutionState['status'] = 'running'): AgentExecutionState {
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
export function completeExecution(
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
export function getStatePath(
  adwId: string,
  agentIdentifier: AgentIdentifier,
  parentAgentPath?: string
): string {
  if (parentAgentPath) {
    return path.join(parentAgentPath, agentIdentifier);
  }
  return path.join(AGENTS_STATE_DIR, adwId, agentIdentifier);
}
