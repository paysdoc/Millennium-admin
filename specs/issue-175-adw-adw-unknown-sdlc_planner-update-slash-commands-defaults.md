# Chore: Update /bug, /chore and /feature slash commands to accept defaults

## Metadata
issueNumber: `175`
adwId: `adw-unknown`
issueJson: `{}`

## Chore Description
The `/bug`, `/chore`, and `/feature` slash commands in `.claude/commands/` currently define three positional variables (`$1` for issueNumber, `$2` for adwId, `$3` for issueJson) with no default values. When these commands are invoked with just a text string (e.g., `/chore 'Update the README'`), the variables `$2` and `$3` are empty, and the extraction logic at the bottom of each file fails because `issueJson` is empty.

The chore is to update all three commands so they:
1. Accept the existing structured arguments (issueNumber, adwId, issueJson) as before for backward compatibility with the ADW pipeline.
2. Accept just a text string as a standalone instruction, in which case the variables default to: `issueNumber=0`, `adwId=adw-unknown`, `issueJson={}`.
3. Use the standalone text directly as the chore/bug/feature description when `issueJson` is not provided.

## Relevant Files
Use these files to resolve the chore:

- `.claude/commands/bug.md` — The `/bug` slash command template. Needs Variables defaults added and extraction logic updated to handle standalone text.
- `.claude/commands/chore.md` — The `/chore` slash command template. Same changes as bug.md.
- `.claude/commands/feature.md` — The `/feature` slash command template. Same changes as bug.md.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `.claude/commands/bug.md`

- Replace the `## Variables` section with:
  ```
  ## Variables
  issueNumber: $1, default 0 if not provided
  adwId: $2, default to `adw-unknown` if not provided
  issueJson: $3, default to empty JSON object if not provided (`{}`)
  ```
- Replace the `## Bug` section (at the bottom of the file) from:
  ```
  ## Bug
  Extract the bug details from the `issueJson` variable (parse the JSON and use the title and body fields).
  ```
  to:
  ```
  ## Bug
  If the `issueJson` variable contains a valid JSON object with `title` and `body` fields, extract the bug details from it.
  Otherwise, use the text passed as the argument to this command as the bug description directly.
  ```

### Step 2: Update `.claude/commands/chore.md`

- Replace the `## Variables` section with:
  ```
  ## Variables
  issueNumber: $1, default 0 if not provided
  adwId: $2, default to `adw-unknown` if not provided
  issueJson: $3, default to empty JSON object if not provided (`{}`)
  ```
- Replace the `## Chore` section (at the bottom of the file) from:
  ```
  ## Chore
  Extract the chore details from the `issueJson` variable (parse the JSON and use the title and body fields).
  ```
  to:
  ```
  ## Chore
  If the `issueJson` variable contains a valid JSON object with `title` and `body` fields, extract the chore details from it.
  Otherwise, use the text passed as the argument to this command as the chore description directly.
  ```

### Step 3: Update `.claude/commands/feature.md`

- Replace the `## Variables` section with:
  ```
  ## Variables
  issueNumber: $1, default 0 if not provided
  adwId: $2, default to `adw-unknown` if not provided
  issueJson: $3, default to empty JSON object if not provided (`{}`)
  ```
- Replace the `## Feature` section (at the bottom of the file) from:
  ```
  ## Feature
  Extract the feature details from the `issueJson` variable (parse the JSON and use the title and body fields).
  ```
  to:
  ```
  ## Feature
  If the `issueJson` variable contains a valid JSON object with `title` and `body` fields, extract the feature details from it.
  Otherwise, use the text passed as the argument to this command as the feature description directly.
  ```

### Step 4: Run Validation Commands

- Run `npm run lint`, `npm run build`, and `npm test` to validate no regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- These changes are purely to `.claude/commands/*.md` markdown files (Claude Code slash command templates). They do not affect any TypeScript/JavaScript source code, so there is no risk of build or runtime regressions.
- The ADW pipeline (`adws/agents/planAgent.ts`) passes a single formatted text argument to these commands via `runClaudeAgentWithCommand`. With the defaults in place, the commands will work identically since `$2` and `$3` resolve to their defaults and the formatted issue text is used directly as the description.
- The `## Report` section at the bottom of each command file remains unchanged.
