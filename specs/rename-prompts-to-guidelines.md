# Chore: Rename prompts directory to guidelines

## Chore Description
The `prompts/` directory contains coding guidelines (`coding_guidelines.md`), not prompts. Rename it to `guidelines/` to accurately reflect its contents. Update all references across the codebase.

## Relevant Files
Use these files to resolve the chore:

- `prompts/coding_guidelines.md` — The file being moved to `guidelines/coding_guidelines.md`.
- `README.md` — References `prompts/` in the Project Structure section.
- `.claude/commands/feature.md` — References `/prompts` and `prompts/**`.
- `.claude/commands/chore.md` — References `/prompts` and `prompts/**`.
- `.claude/commands/bug.md` — References `/prompts` and `prompts/**`.

## Step by Step Tasks

### 1. Rename the directory
- Run `git mv prompts guidelines` to rename the directory while preserving git history.

### 2. Update README.md
- Change `prompts/` to `guidelines/` in the Project Structure section.

### 3. Update .claude/commands/feature.md
- Replace all occurrences of `/prompts` with `/guidelines` and `prompts/**` with `guidelines/**`.

### 4. Update .claude/commands/chore.md
- Replace all occurrences of `/prompts` with `/guidelines` and `prompts/**` with `guidelines/**`.

### 5. Update .claude/commands/bug.md
- Replace all occurrences of `/prompts` with `/guidelines` and `prompts/**` with `guidelines/**`.

### 6. Run Validation Commands

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors

## Notes
- Use `git mv` to preserve history.
- The specs/ files that reference `prompts/` are historical and do not need updating.
