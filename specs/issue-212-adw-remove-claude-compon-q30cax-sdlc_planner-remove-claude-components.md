# Feature: Remove Claude components from repo

## Metadata
issueNumber: `212`
adwId: `remove-claude-compon-q30cax`
issueJson: `{"number":212,"title":"Remove Claude components from repo","body":"The ADW workflow has moved to an external repo. This means that all contents pertaining to Claude can be removed. These include, but are not necessarily restricted to:\n - .claude folder and contents\n - adws folder and contents\n - .playwright-mcp\n\nIMPORTANT: do not remove guidelines/coding_guidelines.md","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-02-25T07:41:51Z","comments":[],"actionableComment":null}`

## Feature Description
The AI Developer Workflow (ADW) system has been migrated to an external repository. All Claude-related configuration, ADW scripts, and Playwright MCP artifacts that remain in this repo are now obsolete and should be removed to reduce clutter and eliminate confusion. The `guidelines/coding_guidelines.md` file must be preserved as it contains project-wide coding standards that are still in use.

## User Story
As a developer
I want to remove obsolete Claude/ADW artifacts from the repository
So that the codebase only contains files relevant to the Millennium Admin application

## Problem Statement
The repository still contains Claude Code configuration (`.claude/`), ADW workflow scripts (`adws/`), and Playwright MCP artifacts (`.playwright-mcp/`) that are no longer needed since the ADW workflow has moved to an external repo. These stale files create confusion and unnecessary bloat.

## Solution Statement
Delete the three directories (`.claude/`, `adws/`, `.playwright-mcp/`) and update all files that reference them — specifically `package.json` (remove `adw:*` scripts), `README.md` (remove ADW/Claude sections from project structure), and any other configuration that points to the removed directories. Preserve `guidelines/coding_guidelines.md` as explicitly requested.

## Relevant Files
Use these files to implement the feature:

- `.claude/` — Entire directory to be deleted. Contains Claude Code commands, hooks, and settings.json. All of this has moved to the external repo.
- `adws/` — Entire directory to be deleted. Contains ADW orchestrators, agents, core utilities, GitHub helpers, triggers, tests, and the `adws/tsconfig.json`. All of this has moved to the external repo.
- `.playwright-mcp/` — Entire directory to be deleted. Contains Playwright MCP screenshots and console logs used during ADW E2E testing.
- `package.json` — Lines 10-14 contain `adw:*` npm scripts (`adw`, `adw:plan-build`, `adw:trigger-webhook`, `adw:trigger-cron`, `adw:pr-review`) that reference files in `adws/`. These scripts must be removed.
- `README.md` — Lines 96-103 describe the `adws/` directory structure, line 114 describes `.claude/` directory. These sections must be removed from the Project Structure listing.
- `guidelines/coding_guidelines.md` — **DO NOT REMOVE.** Must be preserved.

## Implementation Plan
### Phase 1: Foundation
Identify all files and references that need to change. The directories to delete are `.claude/`, `adws/`, and `.playwright-mcp/`. References to these directories exist in `package.json` and `README.md`.

### Phase 2: Core Implementation
1. Delete the three directories.
2. Remove the `adw:*` scripts from `package.json`.
3. Update `README.md` to remove references to the deleted directories from the Project Structure section.

### Phase 3: Integration
Validate that the application still builds, lints, and passes all tests without the removed files. Ensure no import paths or configuration references point to deleted content.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Delete the `.claude/` directory
- Run `rm -r .claude/` to remove the entire Claude Code configuration directory (commands, hooks, settings.json).

### Step 2: Delete the `adws/` directory
- Run `rm -r adws/` to remove the entire ADW scripts directory (orchestrators, agents, core, github, triggers, tests, tsconfig.json, README.md).

### Step 3: Delete the `.playwright-mcp/` directory
- Run `rm -r .playwright-mcp/` to remove the Playwright MCP artifacts directory (screenshots, console logs).

### Step 4: Remove ADW scripts from `package.json`
- Remove the following lines from the `scripts` section in `package.json`:
  - `"adw": "tsx",`
  - `"adw:plan-build": "tsx adws/adwPlanBuild.tsx",`
  - `"adw:trigger-webhook": "tsx adws/triggers/trigger_webhook.ts",`
  - `"adw:trigger-cron": "tsx adws/triggers/trigger_cron.ts",`
  - `"adw:pr-review": "tsx adws/adwPrReview.tsx",`

### Step 5: Update README.md Project Structure section
- Remove the `adws/` block (lines 96-103) from the Project Structure listing that describes the ADW directory tree.
- Remove the `.claude/` line (line 114) from the Project Structure listing.
- Do **not** remove any other content from README.md.

### Step 6: Verify `guidelines/coding_guidelines.md` is preserved
- Confirm that `guidelines/coding_guidelines.md` still exists and has not been modified.

### Step 7: Run validation commands
- Run all validation commands listed below to confirm zero regressions.

## Testing Strategy
### Unit Tests
- Run the existing test suite (`npm test`) to confirm no tests depend on the removed directories. Since the `adws/__tests__/` directory is being removed, only application tests under `src/__tests__/` should remain and pass.

### Edge Cases
- Ensure no remaining source files import from `adws/` or `.claude/`.
- Ensure `guidelines/coding_guidelines.md` is not accidentally deleted.
- Ensure `package.json` is valid JSON after edits.

## Acceptance Criteria
- The `.claude/` directory does not exist in the repository.
- The `adws/` directory does not exist in the repository.
- The `.playwright-mcp/` directory does not exist in the repository.
- `guidelines/coding_guidelines.md` still exists and is unchanged.
- `package.json` has no `adw:*` scripts and is valid JSON.
- `README.md` Project Structure no longer references `adws/` or `.claude/`.
- `npm run lint` passes with zero errors.
- `npm run build` succeeds with zero errors.
- `npm test` passes with zero failures.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `test ! -d .claude && echo "PASS: .claude removed" || echo "FAIL: .claude still exists"` - Verify .claude directory is deleted
- `test ! -d adws && echo "PASS: adws removed" || echo "FAIL: adws still exists"` - Verify adws directory is deleted
- `test ! -d .playwright-mcp && echo "PASS: .playwright-mcp removed" || echo "FAIL: .playwright-mcp still exists"` - Verify .playwright-mcp directory is deleted
- `test -f guidelines/coding_guidelines.md && echo "PASS: coding_guidelines.md preserved" || echo "FAIL: coding_guidelines.md missing"` - Verify coding guidelines preserved
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('PASS: valid JSON')"` - Verify package.json is valid JSON
- `grep -q "adw:" package.json && echo "FAIL: adw scripts still present" || echo "PASS: adw scripts removed"` - Verify adw scripts removed from package.json
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This is a cleanup/removal task — no new code is being written, only deletions and reference updates.
- The `specs/` directory contains many historical plan files that reference `adws/` paths. These are historical artifacts and do not need to be modified — they document past work.
- The `tsx` devDependency in `package.json` should be retained as it may be used by other scripts (e.g., `scripts/sync-supabase.ts`).
