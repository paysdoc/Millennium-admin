
/**
 * JSONL parsing utilities for Claude Code agent output.
 *
 * Extracts structured results from the streamed JSONL that Claude CLI emits,
 * without mutating any caller-owned state.
 */

import { ClaudeCodeResultMessage, AgentStateManager, type ModelUsageMap } from '../core';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
}

export interface ClaudeMessage {
  content?: ContentBlock[];
}

export interface ToolUseInfo {
  name: string;
  input: string;
}

/**
 * Immutable result returned by `parseJsonlOutput`.
 * The caller decides how to fold these deltas into its own mutable state.
 */
export interface ParsedJsonlResult {
  lastResult?: ClaudeCodeResultMessage;
  modelUsage?: ModelUsageMap;
  additionalOutput: string;
  turnCountDelta: number;
  toolUses: ToolUseInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts text content from a Claude assistant message.
 */
export function extractTextFromAssistantMessage(message: ClaudeMessage): string {
  return (message?.content ?? [])
    .filter((block): block is ContentBlock & { text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Extracts tool-use entries from a Claude assistant message.
 */
export function extractToolUseFromMessage(message: ClaudeMessage): ToolUseInfo[] {
  return (message?.content ?? [])
    .filter((block) => block.type === 'tool_use')
    .map((block) => {
      const inputSummary = typeof block.input === 'object'
        ? JSON.stringify(block.input).substring(0, 200)
        : String(block.input).substring(0, 200);
      return { name: block.name ?? 'unknown', input: inputSummary };
    });
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

interface ParsedLine {
  type: string;
  message?: ClaudeMessage;
  modelUsage?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Parses JSONL text and returns an immutable result describing what changed.
 *
 * Side-effects are limited to writing raw output / logs via `AgentStateManager`
 * when a `statePath` is supplied — these are fire-and-forget I/O calls that
 * do not affect the returned value.
 */
export function parseJsonlOutput(
  text: string,
  statePath?: string,
): ParsedJsonlResult {
  const lines = text.split('\n').filter((line) => line.trim());

  const initial: ParsedJsonlResult = {
    additionalOutput: '',
    turnCountDelta: 0,
    toolUses: [],
  };

  return lines.reduce<ParsedJsonlResult>((acc, line) => {
    try {
      const parsed: ParsedLine = JSON.parse(line);

      // Persist raw JSONL for debugging when state tracking is active
      if (statePath) {
        AgentStateManager.writeRawOutput(statePath, 'output.jsonl', parsed, true);
      }

      if (parsed.type === 'result') {
        return {
          ...acc,
          lastResult: parsed as unknown as ClaudeCodeResultMessage,
          modelUsage:
            parsed.modelUsage && typeof parsed.modelUsage === 'object'
              ? (parsed.modelUsage as ModelUsageMap)
              : acc.modelUsage,
        };
      }

      if (parsed.type === 'assistant' && parsed.message) {
        const messageText = extractTextFromAssistantMessage(parsed.message);
        const tools = extractToolUseFromMessage(parsed.message);

        // Log tool usage when state tracking is active
        if (statePath) {
          const turn = acc.turnCountDelta + 1;
          tools.forEach((tool) =>
            AgentStateManager.appendLog(statePath, `[Turn ${turn}] Tool: ${tool.name}`),
          );
        }

        return {
          ...acc,
          additionalOutput: acc.additionalOutput + (messageText ? messageText + '\n' : ''),
          turnCountDelta: acc.turnCountDelta + 1,
          toolUses: [...acc.toolUses, ...tools],
        };
      }

      return acc;
    } catch {
      return { ...acc, additionalOutput: acc.additionalOutput + line + '\n' };
    }
  }, initial);
}
