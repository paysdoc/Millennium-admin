
/**
 * Claude Code agent runner for executing AI agents.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { ClaudeCodeResultMessage } from './dataTypes';
import { CLAUDE_CODE_PATH } from './config';
import { log } from './utils';

export interface AgentResult {
  success: boolean;
  output: string;
  sessionId?: string;
  totalCostUsd?: number;
}

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
 * Parses JSONL output from Claude and extracts result information.
 */
function parseJsonlOutput(
  text: string,
  state: { lastResult: ClaudeCodeResultMessage | null; fullOutput: string }
): void {
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      if (parsed.type === 'result') {
        state.lastResult = parsed as ClaudeCodeResultMessage;
      }

      if (parsed.type === 'assistant') {
        state.fullOutput += extractTextFromAssistantMessage(parsed.message);
      }
    } catch {
      state.fullOutput += line + '\n';
    }
  }
}

/**
 * Runs a Claude Code agent with the given prompt.
 * Streams output to a log file and returns the result.
 */
export async function runClaudeAgent(
  prompt: string,
  agentName: string,
  outputFile: string,
  model: string = 'sonnet'
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--model', model
    ];

    log(`Starting ${agentName} agent...`, 'info');

    const claude = spawn(CLAUDE_CODE_PATH, args, {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    // Write prompt to stdin and close it
    claude.stdin.write(prompt);
    claude.stdin.end();

    const state = {
      lastResult: null as ClaudeCodeResultMessage | null,
      fullOutput: ''
    };

    const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

    claude.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(text);
      parseJsonlOutput(text, state);
    });

    claude.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      outputStream.write(`[STDERR] ${text}`);
      log(`${agentName} stderr: ${text}`, 'error');
    });

    claude.on('close', (code) => {
      outputStream.end();

      if (code === 0 && state.lastResult) {
        log(`${agentName} completed successfully`, 'success');
        resolve({
          success: !state.lastResult.isError,
          output: state.lastResult.result || state.fullOutput,
          sessionId: state.lastResult.sessionId,
          totalCostUsd: state.lastResult.totalCostUsd
        });
      } else if (code === 0) {
        resolve({
          success: true,
          output: state.fullOutput
        });
      } else {
        log(`${agentName} exited with code ${code}`, 'error');
        resolve({
          success: false,
          output: state.fullOutput || 'Agent failed without output'
        });
      }
    });

    claude.on('error', (error) => {
      outputStream.end();
      log(`${agentName} error: ${error.message}`, 'error');
      resolve({
        success: false,
        output: error.message
      });
    });
  });
}
