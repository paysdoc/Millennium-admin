
/**
 * Claude Code agent runner for executing AI agents.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { ClaudeCodeResultMessage, CLAUDE_CODE_PATH, log, AgentStateManager } from '../core';

export interface AgentResult {
  success: boolean;
  output: string;
  sessionId?: string;
  totalCostUsd?: number;
  /** The state path if state tracking was enabled */
  statePath?: string;
}

/**
 * Progress information passed to the progress callback.
 */
export interface ProgressInfo {
  type: 'tool_use' | 'text' | 'summary';
  toolName?: string;
  toolInput?: string;
  text?: string;
  turnCount?: number;
  toolCount?: number;
}

/**
 * Callback function for progress updates during agent execution.
 */
export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * Extracts text content from Claude assistant messages.
 */
function extractTextFromAssistantMessage(message: any): string {
  let text = '';
  if (message?.content) {
    for (const block of message.content) {
      if (block.type === 'text') {
        text += block.text + '\n';
      }
    }
  }
  return text;
}

/**
 * Extracts tool use information from an assistant message.
 */
function extractToolUseFromMessage(message: any): { name: string; input: string }[] {
  const tools: { name: string; input: string }[] = [];
  if (message?.content) {
    for (const block of message.content) {
      if (block.type === 'tool_use') {
        const inputSummary = typeof block.input === 'object'
          ? JSON.stringify(block.input).substring(0, 200)
          : String(block.input).substring(0, 200);
        tools.push({ name: block.name, input: inputSummary });
      }
    }
  }
  return tools;
}

/**
 * Parses JSONL output from Claude and extracts result information.
 */
function parseJsonlOutput(
  text: string,
  state: { lastResult: ClaudeCodeResultMessage | null; fullOutput: string; turnCount: number; toolCount: number },
  onProgress?: ProgressCallback,
  statePath?: string
): void {
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Write raw JSONL to state output file if statePath provided
      if (statePath) {
        AgentStateManager.writeRawOutput(statePath, 'output.jsonl', parsed, true);
      }

      if (parsed.type === 'result') {
        state.lastResult = parsed as ClaudeCodeResultMessage;
      }

      if (parsed.type === 'assistant') {
        state.turnCount++;
        state.fullOutput += extractTextFromAssistantMessage(parsed.message);

        // Extract and report tool usage
        const toolUses = extractToolUseFromMessage(parsed.message);
        for (const tool of toolUses) {
          state.toolCount++;
          if (onProgress) {
            onProgress({
              type: 'tool_use',
              toolName: tool.name,
              toolInput: tool.input,
              turnCount: state.turnCount,
              toolCount: state.toolCount,
            });
          }
          // Log tool usage to state
          if (statePath) {
            AgentStateManager.appendLog(statePath, `[Turn ${state.turnCount}] Tool: ${tool.name}`);
          }
        }

        // Report text content if present (for status updates)
        const textContent = extractTextFromAssistantMessage(parsed.message).trim();
        if (textContent && onProgress) {
          onProgress({
            type: 'text',
            text: textContent.substring(0, 500),
            turnCount: state.turnCount,
          });
        }
      }
    } catch {
      state.fullOutput += line + '\n';
    }
  }
}

/**
 * Runs a Claude Code agent with the given prompt.
 * Streams output to a log file and returns the result.
 *
 * @param prompt - The prompt to send to the agent
 * @param agentName - Human-readable name for logging
 * @param outputFile - Path to write JSONL output
 * @param model - The model to use (default: 'sonnet')
 * @param onProgress - Optional callback for progress updates
 * @param statePath - Optional path to agent's state directory for state tracking
 */
export async function runClaudeAgent(
  prompt: string,
  agentName: string,
  outputFile: string,
  model: string = 'sonnet',
  onProgress?: ProgressCallback,
  statePath?: string
): Promise<AgentResult> {
  // Write initial state if state path provided
  if (statePath) {
    AgentStateManager.appendLog(statePath, `Starting ${agentName} agent`, prompt);
    AgentStateManager.appendLog(statePath, `Model: ${model}`);
  }

  return new Promise((resolve) => {
    const args = [
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--model', model
    ];

    log(`Starting ${agentName} agent...`, 'info');
    log(`  Command: ${CLAUDE_CODE_PATH} ${args.join(' ')}`, 'info');
    log(`  Model: ${model}`, 'info');
    log(`  Output file: ${outputFile}`, 'info');
    log(`  Prompt length: ${prompt.length} characters`, 'info');

    const claude = spawn(CLAUDE_CODE_PATH, args, {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    // Write prompt to stdin and close it
    claude.stdin.write(prompt);
    claude.stdin.end();

    const state = {
      lastResult: null as ClaudeCodeResultMessage | null,
      fullOutput: '',
      turnCount: 0,
      toolCount: 0,
    };

    const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

    claude.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(text);
      parseJsonlOutput(text, state, onProgress, statePath);
    });

    claude.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(`[STDERR] ${text}`);
      log(`${agentName} stderr: ${text}`, 'error');
    });

    claude.on('close', (code) => {
      outputStream.end();

      // Log final summary
      log(`${agentName} agent finished:`, 'info');
      log(`  Exit code: ${code}`, 'info');
      log(`  Total turns: ${state.turnCount}`, 'info');
      log(`  Total tool calls: ${state.toolCount}`, 'info');

      if (onProgress) {
        onProgress({
          type: 'summary',
          turnCount: state.turnCount,
          toolCount: state.toolCount,
        });
      }

      // Write final state summary if statePath provided
      if (statePath) {
        AgentStateManager.appendLog(
          statePath,
          `Completed: exit code ${code}, turns: ${state.turnCount}, tools: ${state.toolCount}`
        );
      }

      if (code === 0 && state.lastResult) {
        log(`${agentName} completed successfully`, 'success');
        if (state.lastResult.totalCostUsd) {
          log(`  Cost: $${state.lastResult.totalCostUsd.toFixed(4)}`, 'info');
        }
        resolve({
          success: !state.lastResult.isError,
          output: state.lastResult.result || state.fullOutput,
          sessionId: state.lastResult.sessionId,
          totalCostUsd: state.lastResult.totalCostUsd,
          statePath
        });
      } else if (code === 0) {
        resolve({
          success: true,
          output: state.fullOutput,
          statePath
        });
      } else {
        log(`${agentName} exited with code ${code}`, 'error');
        resolve({
          success: false,
          output: state.fullOutput || 'Agent failed without output',
          statePath
        });
      }
    });

    claude.on('error', (error) => {
      outputStream.end();
      log(`${agentName} error: ${error.message}`, 'error');
      // Log error to state if statePath provided
      if (statePath) {
        AgentStateManager.appendLog(statePath, `Error: ${error.message}`);
      }
      resolve({
        success: false,
        output: error.message,
        statePath
      });
    });
  });
}

/**
 * Runs a Claude Code agent with a slash command.
 * The command is passed as a CLI argument rather than via stdin.
 *
 * @param command - The slash command to invoke (e.g., '/implement', '/feature')
 * @param args - Arguments to pass to the command (replaces $ARGUMENTS)
 * @param agentName - Human-readable name for logging
 * @param outputFile - Path to write JSONL output
 * @param model - The model to use ('opus', 'sonnet', 'haiku')
 * @param onProgress - Optional callback for progress updates
 * @param statePath - Optional path to agent's state directory for state tracking
 */
export async function runClaudeAgentWithCommand(
  command: string,
  args: string,
  agentName: string,
  outputFile: string,
  model: string = 'sonnet',
  onProgress?: ProgressCallback,
  statePath?: string
): Promise<AgentResult> {
  // Build the prompt as "command 'args'" for the CLI
  // The args are single-quoted to preserve formatting
  const prompt = `${command} '${args.replace(/'/g, "'\\''")}'`;

  // Write initial state if state path provided
  if (statePath) {
    AgentStateManager.appendLog(statePath, `Starting ${agentName} agent with command: ${command}`, prompt);
    AgentStateManager.appendLog(statePath, `Model: ${model}`);
  }

  return new Promise((resolve) => {
    const cliArgs = [
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--model', model,
      prompt
    ];

    log(`Starting ${agentName} agent...`, 'info');
    log(`  Command: ${CLAUDE_CODE_PATH} ${cliArgs.slice(0, -1).join(' ')} "<prompt>"`, 'info');
    log(`  Slash command: ${command}`, 'info');
    log(`  Model: ${model}`, 'info');
    log(`  Output file: ${outputFile}`, 'info');
    log(`  Args length: ${args.length} characters`, 'info');

    const claude = spawn(CLAUDE_CODE_PATH, cliArgs, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const state = {
      lastResult: null as ClaudeCodeResultMessage | null,
      fullOutput: '',
      turnCount: 0,
      toolCount: 0,
    };

    const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

    claude.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(text);
      parseJsonlOutput(text, state, onProgress, statePath);
    });

    claude.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(`[STDERR] ${text}`);
      log(`${agentName} stderr: ${text}`, 'error');
    });

    claude.on('close', (code) => {
      outputStream.end();

      // Log final summary
      log(`${agentName} agent finished:`, 'info');
      log(`  Exit code: ${code}`, 'info');
      log(`  Total turns: ${state.turnCount}`, 'info');
      log(`  Total tool calls: ${state.toolCount}`, 'info');

      if (onProgress) {
        onProgress({
          type: 'summary',
          turnCount: state.turnCount,
          toolCount: state.toolCount,
        });
      }

      // Write final state summary if statePath provided
      if (statePath) {
        AgentStateManager.appendLog(
          statePath,
          `Completed: exit code ${code}, turns: ${state.turnCount}, tools: ${state.toolCount}`
        );
      }

      if (code === 0 && state.lastResult) {
        log(`${agentName} completed successfully`, 'success');
        if (state.lastResult.totalCostUsd) {
          log(`  Cost: $${state.lastResult.totalCostUsd.toFixed(4)}`, 'info');
        }
        resolve({
          success: !state.lastResult.isError,
          output: state.lastResult.result || state.fullOutput,
          sessionId: state.lastResult.sessionId,
          totalCostUsd: state.lastResult.totalCostUsd,
          statePath
        });
      } else if (code === 0) {
        resolve({
          success: true,
          output: state.fullOutput,
          statePath
        });
      } else {
        log(`${agentName} exited with code ${code}`, 'error');
        resolve({
          success: false,
          output: state.fullOutput || 'Agent failed without output',
          statePath
        });
      }
    });

    claude.on('error', (error) => {
      outputStream.end();
      log(`${agentName} error: ${error.message}`, 'error');
      // Log error to state if statePath provided
      if (statePath) {
        AgentStateManager.appendLog(statePath, `Error: ${error.message}`);
      }
      resolve({
        success: false,
        output: error.message,
        statePath
      });
    });
  });
}
