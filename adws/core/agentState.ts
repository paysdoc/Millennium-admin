/**
 * AgentStateManager - File-based state management for ADW agents.
 * Barrel re-export file that preserves the original class API for backward compatibility.
 */

import { writeState, readState, appendLog, writeRawOutput, readParentState, stateExists } from './agentStateIO';
import { initializeState, createExecutionState, completeExecution, getStatePath } from './agentStateLogic';

/**
 * AgentStateManager delegates to agentStateIO and agentStateLogic sub-modules.
 */
export class AgentStateManager {
  static initializeState = initializeState;
  static writeState = writeState;
  static readState = readState;
  static appendLog = appendLog;
  static writeRawOutput = writeRawOutput;
  static readParentState = readParentState;
  static createExecutionState = createExecutionState;
  static completeExecution = completeExecution;
  static getStatePath = getStatePath;
  static stateExists = stateExists;
}

// Export utility functions for convenience
export const initializeAgentState = initializeState;
export const writeAgentState = writeState;
export const readAgentState = readState;
export const appendAgentLog = appendLog;
export const writeAgentRawOutput = writeRawOutput;
export const readParentAgentState = readParentState;
