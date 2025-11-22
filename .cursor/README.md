# Cursor Hooks Configuration

This directory contains Cursor hooks that implement guardrails and quality gates for the Millennium Admin project.

## Hooks Overview

### 1. `validate-command.js` (beforeShellCommand)
Prevents dangerous operations:
- Blocks `rm -rf` and all variations
- Prevents changing directory outside project context
- Blocks access to `.env` files containing sensitive data

### 2. `log-command.js` (afterShellCommand)
Logs every command executed by the agent:
- Logs to `.cursor/logs/agent-commands.log` (JSON format)
- Also creates human-readable log at `.cursor/logs/agent-commands-readable.log`
- Includes timestamp, command, exit code, and working directory

### 3. `quality-gate.js` (afterFileEdit)
Automated quality gates based on `prompts/coding_guidelines.md`:
- File size check (max 150 lines)
- TypeScript guidelines enforcement (no `any`, avoid non-null assertions)
- TODO comment detection
- Error handling checks
- ESLint integration
- Code hygiene checks
- Additional safety: Blocks editing `.env` files and files outside project context

### 4. `prevent-env-access.js` (beforeReadFile)
Pre-read validation:
- Blocks reading `.env` files containing sensitive data
- Prevents reading files outside project context
- Also prevents editing these files indirectly by blocking access

## Configuration

Hooks are configured in `.cursor/hooks.json`. Cursor will automatically load and execute these hooks.

## Logs

All logs are stored in `.cursor/logs/`:
- `agent-commands.log` - JSON format command log
- `agent-commands-readable.log` - Human-readable command log
- `hook-errors.log` - Errors from hook execution

## Testing Hooks

To test if hooks are working:

1. Try a blocked command:
   ```bash
   rm -rf /tmp/test
   ```

2. Check the logs:
   ```bash
   cat .cursor/logs/agent-commands-readable.log
   ```

3. Edit a file and check quality gate output in Cursor's console

## Customization

Edit the hook files in `.cursor/hooks/` to customize behavior. Each hook:
- Reads JSON from stdin
- Outputs JSON to stdout (allow) or stderr (block)
- Exits with code 0 (allow) or 1 (block)

## Notes

- Hooks are executed by Node.js, so ensure Node.js is available in PATH
- Hooks should be fast to avoid slowing down the agent
- On hook errors, the system defaults to allowing the action (fail-open) but logs the error


