/**
 * Claude Code agent runner for executing AI agents.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { ClaudeCodeResultMessage, CLAUDE_CODE_PATH, log, AgentStateManager, type ModelUsageMap } from '../core';
import { parseJsonlOutput, type ParsedJsonlResult } from './jsonlParser';

export interface AgentResult {
  success: boolean;
  output: string;
  sessionId?: string;
  totalCostUsd?: number;
  modelUsage?: ModelUsageMap;
  statePath?: string;
}

export interface ProgressInfo {
  type: 'tool_use' | 'text' | 'summary';
  toolName?: string;
  toolInput?: string;
  text?: string;
  turnCount?: number;
  toolCount?: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

interface AgentState {
  lastResult: ClaudeCodeResultMessage | null;
  fullOutput: string;
  turnCount: number;
  toolCount: number;
  modelUsage: ModelUsageMap | undefined;
}

function applyParsedResult(state: AgentState, result: ParsedJsonlResult, onProgress?: ProgressCallback): void {
  if (result.lastResult) state.lastResult = result.lastResult;
  if (result.modelUsage) state.modelUsage = result.modelUsage;
  state.fullOutput += result.additionalOutput;
  state.turnCount += result.turnCountDelta;
  result.toolUses.forEach((tool) => {
    state.toolCount++;
    onProgress?.({ type: 'tool_use', toolName: tool.name, toolInput: tool.input, turnCount: state.turnCount, toolCount: state.toolCount });
  });
  if (result.additionalOutput.trim() && onProgress) {
    onProgress({ type: 'text', text: result.additionalOutput.trim().substring(0, 500), turnCount: state.turnCount });
  }
}

function resolveResult(state: AgentState, code: number | null, statePath?: string): AgentResult {
  if (code === 0 && state.lastResult) {
    return { success: !state.lastResult.isError, output: state.lastResult.result || state.fullOutput,
      sessionId: state.lastResult.sessionId, totalCostUsd: state.lastResult.totalCostUsd, modelUsage: state.modelUsage, statePath };
  }
  return code === 0
    ? { success: true, output: state.fullOutput, modelUsage: state.modelUsage, statePath }
    : { success: false, output: state.fullOutput || 'Agent failed without output', modelUsage: state.modelUsage, statePath };
}

function logCompletion(name: string, state: AgentState, code: number | null, statePath?: string): void {
  log(`${name} agent finished:`, 'info');
  [`Exit code: ${code}`, `Total turns: ${state.turnCount}`, `Total tool calls: ${state.toolCount}`].forEach((m) => log(`  ${m}`, 'info'));
  if (statePath) AgentStateManager.appendLog(statePath, `Completed: exit code ${code}, turns: ${state.turnCount}, tools: ${state.toolCount}`);
  if (code === 0 && state.lastResult) {
    log(`${name} completed successfully`, 'success');
    if (state.lastResult.totalCostUsd) log(`  Cost: $${state.lastResult.totalCostUsd.toFixed(4)}`, 'info');
    if (state.modelUsage) log(`  Models used: ${Object.keys(state.modelUsage).join(', ')}`, 'info');
  } else if (code !== 0) { log(`${name} exited with code ${code}`, 'error'); }
}

/** Wire stdout/stderr/close/error handlers and return a result promise. */
function wireProcess(proc: ChildProcess, agentName: string, outputFile: string,
  onProgress: ProgressCallback | undefined, statePath: string | undefined): Promise<AgentResult> {
  return new Promise((resolve) => {
    const state: AgentState = { lastResult: null, fullOutput: '', turnCount: 0, toolCount: 0, modelUsage: undefined };
    const out = fs.createWriteStream(outputFile, { flags: 'a' });
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString(); out.write(text);
      applyParsedResult(state, parseJsonlOutput(text, statePath), onProgress);
    });
    proc.stderr?.on('data', (data: Buffer) => { const t = data.toString(); out.write(`[STDERR] ${t}`); log(`${agentName} stderr: ${t}`, 'error'); });
    proc.on('close', (code) => {
      out.end(); logCompletion(agentName, state, code, statePath);
      onProgress?.({ type: 'summary', turnCount: state.turnCount, toolCount: state.toolCount });
      resolve(resolveResult(state, code, statePath));
    });
    proc.on('error', (error) => {
      out.end(); log(`${agentName} error: ${error.message}`, 'error');
      if (statePath) AgentStateManager.appendLog(statePath, `Error: ${error.message}`);
      resolve({ success: false, output: error.message, statePath });
    });
  });
}

export async function runClaudeAgent(
  prompt: string, agentName: string, outputFile: string, model: string = 'sonnet',
  onProgress?: ProgressCallback, statePath?: string, cwd?: string,
): Promise<AgentResult> {
  if (statePath) {
    AgentStateManager.appendLog(statePath, `Starting ${agentName} agent`, prompt);
    AgentStateManager.appendLog(statePath, `Model: ${model}`);
  }
  const args = ['--print', '--verbose', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--model', model];
  log(`Starting ${agentName} agent...`, 'info');
  log(`  Command: ${CLAUDE_CODE_PATH} ${args.join(' ')}`, 'info');
  log(`  Model: ${model}`, 'info');
  log(`  Output file: ${outputFile}`, 'info');
  log(`  Prompt length: ${prompt.length} characters`, 'info');
  const claude = spawn(CLAUDE_CODE_PATH, args, { cwd: cwd || process.cwd(), env: { ...process.env } });
  claude.stdin.write(prompt);
  claude.stdin.end();
  return wireProcess(claude, agentName, outputFile, onProgress, statePath);
}

export async function runClaudeAgentWithCommand(
  command: string, args: string, agentName: string, outputFile: string,
  model: string = 'sonnet', onProgress?: ProgressCallback, statePath?: string, cwd?: string,
): Promise<AgentResult> {
  const prompt = `${command} '${args.replace(/'/g, "'\\''")}'`;
  if (statePath) {
    AgentStateManager.appendLog(statePath, `Starting ${agentName} agent with command: ${command}`, prompt);
    AgentStateManager.appendLog(statePath, `Model: ${model}`);
  }
  const cliArgs = ['--print', '--verbose', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--model', model, prompt];
  log(`Starting ${agentName} agent...`, 'info');
  log(`  Command: ${CLAUDE_CODE_PATH} ${cliArgs.slice(0, -1).join(' ')} "<prompt>"`, 'info');
  log(`  Slash command: ${command}`, 'info');
  log(`  Model: ${model}`, 'info');
  log(`  Output file: ${outputFile}`, 'info');
  log(`  Args length: ${args.length} characters`, 'info');
  const claude = spawn(CLAUDE_CODE_PATH, cliArgs, { cwd: cwd || process.cwd(), env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  return wireProcess(claude, agentName, outputFile, onProgress, statePath);
}
