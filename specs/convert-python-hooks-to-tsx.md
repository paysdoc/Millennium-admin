# Feature: Convert Python Hooks to TSX

## Feature Description
Convert the Claude Code hooks from Python scripts (`.claude/hooks/*.py`) to TypeScript/TSX files and update the settings.json to use the new TypeScript versions. This migration brings consistency with the rest of the codebase (which uses TypeScript) and leverages the existing `tsx` runtime that's already configured in the project.

## User Story
As a developer maintaining this codebase
I want all Claude Code hooks to be written in TypeScript
So that the entire codebase uses a consistent language and I can leverage TypeScript's type safety features

## Problem Statement
The current Claude Code hooks are written in Python while the rest of the application (Next.js frontend, ADW scripts) uses TypeScript. This creates:
1. Language fragmentation requiring developers to switch contexts between Python and TypeScript
2. Dependency on Python/uv runtime when the project already has tsx available
3. Inability to share TypeScript types and utilities between hooks and the rest of the codebase
4. Inconsistent developer experience

## Solution Statement
Migrate all Python hooks to TypeScript (TSX) files:
1. Create TypeScript equivalents for each Python hook (pre_tool_use, post_tool_use, notification, stop, subagent_stop)
2. Create a shared constants/utils module in TypeScript for common functionality
3. Update `.claude/settings.json` to invoke the TypeScript hooks via `npx tsx` instead of `uv run`
4. Remove the Python hooks and their dependencies

## Relevant Files
Use these files to implement the feature:

- `.claude/hooks/pre_tool_use.py` — Contains dangerous command detection (rm -rf) and .env file access blocking. Must be converted preserving all regex patterns and security logic.
- `.claude/hooks/post_tool_use.py` — Logs tool usage to session-specific JSON files. Simple conversion with JSON file handling.
- `.claude/hooks/notification.py` — Logs notifications to session-specific JSON files. Has optional --notify argument.
- `.claude/hooks/stop.py` — Logs stop events and optionally converts JSONL transcript to JSON. Has --chat argument.
- `.claude/hooks/subagent_stop.py` — Similar to stop.py but for subagent stops. Has --chat argument.
- `.claude/hooks/utils/constants.py` — Shared utilities for session log directory management. Must be converted to TypeScript module.
- `.claude/settings.json` — Configuration file that defines hook commands. Must be updated to use `npx tsx` instead of `uv run`.
- `adws/utils.ts` — Reference for TypeScript utility patterns used in this project.
- `adws/config.ts` — Reference for configuration patterns used in this project.

### New Files
- `.claude/hooks/pre-tool-use.ts` — TypeScript version of pre_tool_use.py
- `.claude/hooks/post-tool-use.ts` — TypeScript version of post_tool_use.py
- `.claude/hooks/notification.ts` — TypeScript version of notification.py
- `.claude/hooks/stop.ts` — TypeScript version of stop.py
- `.claude/hooks/subagent-stop.ts` — TypeScript version of subagent_stop.py
- `.claude/hooks/utils/constants.ts` — TypeScript version of utils/constants.py

## Implementation Plan
### Phase 1: Foundation
Create the shared TypeScript utilities module that will be used by all hooks. This includes the session log directory management functions that are currently in `utils/constants.py`.

### Phase 2: Core Implementation
Convert each Python hook to TypeScript one by one, ensuring:
- All regex patterns for security checks are preserved exactly
- JSON stdin parsing works correctly
- Exit codes are preserved (0 for success, 2 for block)
- Command-line argument parsing works for hooks that need it (--notify, --chat)
- File I/O operations use Node.js fs module correctly

### Phase 3: Integration
Update `.claude/settings.json` to use the new TypeScript hooks via `npx tsx`, test all hooks work correctly, and clean up Python files.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Create shared constants module in TypeScript
- Create `.claude/hooks/utils/constants.ts`
- Export `LOG_BASE_DIR` constant (reads from `CLAUDE_HOOKS_LOG_DIR` env var, defaults to `"logs"`)
- Export `getSessionLogDir(sessionId: string): string` function
- Export `ensureSessionLogDir(sessionId: string): string` function that creates the directory if it doesn't exist
- Use Node.js `fs` and `path` modules following patterns from `adws/utils.ts`

### 2. Convert pre_tool_use.py to pre-tool-use.ts
- Create `.claude/hooks/pre-tool-use.ts`
- Import constants from `./utils/constants`
- Implement `isDangerousRmCommand(command: string): boolean` preserving all regex patterns
- Implement `isEnvFileAccess(toolName: string, toolInput: Record<string, unknown>): boolean` preserving all patterns
- Implement `main()` async function that:
  - Reads JSON from stdin using `process.stdin`
  - Checks for .env file access and dangerous rm commands
  - Logs to session directory
  - Exits with code 2 for blocked commands, 0 for allowed
- Add shebang: `#!/usr/bin/env npx tsx`

### 3. Convert post_tool_use.py to post-tool-use.ts
- Create `.claude/hooks/post-tool-use.ts`
- Import constants from `./utils/constants`
- Implement `main()` async function that:
  - Reads JSON from stdin
  - Appends to session-specific `post_tool_use.json`
  - Exits with code 0
- Add shebang: `#!/usr/bin/env npx tsx`

### 4. Convert notification.py to notification.ts
- Create `.claude/hooks/notification.ts`
- Import constants from `./utils/constants`
- Parse `--notify` argument from `process.argv`
- Implement `main()` async function that:
  - Reads JSON from stdin
  - Appends to session-specific `notification.json`
  - Exits with code 0
- Add shebang: `#!/usr/bin/env npx tsx`

### 5. Convert stop.py to stop.ts
- Create `.claude/hooks/stop.ts`
- Import constants from `./utils/constants`
- Parse `--chat` argument from `process.argv`
- Implement `main()` async function that:
  - Reads JSON from stdin
  - Appends to session-specific `stop.json`
  - If `--chat` flag and `transcript_path` exists, convert JSONL to JSON array and save as `chat.json`
  - Exits with code 0
- Add shebang: `#!/usr/bin/env npx tsx`

### 6. Convert subagent_stop.py to subagent-stop.ts
- Create `.claude/hooks/subagent-stop.ts`
- Import constants from `./utils/constants`
- Parse `--chat` argument from `process.argv`
- Implement `main()` async function (similar to stop.ts but writes to `subagent_stop.json`)
- Add shebang: `#!/usr/bin/env npx tsx`

### 7. Update settings.json to use TypeScript hooks
- Update `.claude/settings.json`:
  - Change `PreToolUse` command from `uv run ... pre_tool_use.py` to `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use.ts`
  - Change `PostToolUse` command from `uv run ... post_tool_use.py` to `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use.ts`
  - Change `Notification` command from `uv run ... notification.py` to `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/notification.ts`
  - Change `Stop` command from `uv run ... stop.py` to `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/stop.ts`
  - Change `SubagentStop` command from `uv run ... subagent_stop.py` to `npx tsx $CLAUDE_PROJECT_DIR/.claude/hooks/subagent-stop.ts`
- Preserve all existing arguments (--notify, --chat) and `|| true` error handling

### 8. Remove Python hook files
- Delete `.claude/hooks/pre_tool_use.py`
- Delete `.claude/hooks/post_tool_use.py`
- Delete `.claude/hooks/notification.py`
- Delete `.claude/hooks/stop.py`
- Delete `.claude/hooks/subagent_stop.py`
- Delete `.claude/hooks/utils/constants.py`
- Delete `.claude/hooks/utils/__pycache__/` directory
- Delete `.claude/hooks/utils/llm/` directory (anth.py, oai.py) if not used elsewhere

### 9. Run Validation Commands

## Testing Strategy
### Unit Tests
- Test `isDangerousRmCommand()` with various dangerous and safe rm commands
- Test `isEnvFileAccess()` with various tool names and file paths
- Test `ensureSessionLogDir()` creates directories correctly

### Integration Tests
- Test each hook by piping sample JSON input and verifying correct output/exit codes
- Test that blocked commands return exit code 2
- Test that allowed commands return exit code 0
- Test that log files are created in correct session directories

### Edge Cases
- Empty stdin input (should handle gracefully)
- Invalid JSON input (should exit cleanly with code 0)
- Missing session_id (should use "unknown" default)
- Non-existent transcript_path for --chat flag
- Unicode characters in command strings

## Acceptance Criteria
- All five Python hooks are converted to TypeScript
- All regex patterns for security checks are preserved exactly
- settings.json uses `npx tsx` to run the TypeScript hooks
- Hooks correctly read JSON from stdin and parse arguments
- Pre-tool-use hook blocks dangerous rm commands (exit code 2)
- Pre-tool-use hook blocks .env file access (exit code 2)
- All hooks log to session-specific JSON files
- Stop hooks correctly convert JSONL to JSON when --chat flag is used
- Python files are removed from the repository
- No TypeScript/linting errors
- Build passes successfully

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | npx tsx .claude/hooks/pre-tool-use.ts; echo "Exit code: $?"` - Test pre-tool-use blocks dangerous rm (should show exit code 2)
- `echo '{"tool_name":"Read","tool_input":{"file_path":".env"}}' | npx tsx .claude/hooks/pre-tool-use.ts; echo "Exit code: $?"` - Test pre-tool-use blocks .env access (should show exit code 2)
- `echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"test-session"}' | npx tsx .claude/hooks/pre-tool-use.ts; echo "Exit code: $?"` - Test pre-tool-use allows safe command (should show exit code 0)
- `echo '{"session_id":"test-session"}' | npx tsx .claude/hooks/post-tool-use.ts` - Test post-tool-use runs without error
- `echo '{"session_id":"test-session"}' | npx tsx .claude/hooks/notification.ts --notify` - Test notification runs without error
- `echo '{"session_id":"test-session"}' | npx tsx .claude/hooks/stop.ts --chat` - Test stop runs without error
- `echo '{"session_id":"test-session"}' | npx tsx .claude/hooks/subagent-stop.ts` - Test subagent-stop runs without error

## Notes
- The project already has `tsx` as a devDependency (version ^4.19.0), so no new packages are needed.
- Using `npx tsx` ensures the hooks use the project's installed version of tsx.
- The TypeScript hooks should use kebab-case filenames (e.g., `pre-tool-use.ts`) following common Node.js conventions, while the Python files used snake_case.
- All hooks should handle errors gracefully and exit with code 0 on unexpected errors to avoid blocking Claude operations.
- The shebang `#!/usr/bin/env npx tsx` allows hooks to be run directly as executables if needed.
- Consider adding a tsconfig.json in `.claude/hooks/` if needed for IDE support, but the hooks can use the root tsconfig.
