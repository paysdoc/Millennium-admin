# PR-Review: Move misplaced PNG screenshots and verify committed files

## PR-Review Description
The reviewer (paysdoc) raised two comments on PR #185:

1. **"Why have tokenLimitRecover.test.ts and route.ts not been checked in?"** — This comment was addressed in a prior revision. `adws/__tests__/tokenLimitRecovery.test.ts` was committed in `7f91f54` with the required `applicationUrl` field added to the mock config. `src/app/api/characters/[id]/route.ts` had unrelated `revalidatePath` changes that were reverted since they don't belong to issue #182. The git diff against `main` confirms `route.ts` has no outstanding changes. **No further action required for this comment.**

2. **"png's should live in the relevant subdirectory of character_edit, not in the project root"** — Eight PNG files were committed to the project root in commit `0589627` instead of the correct `e2e-screenshots/character_edit/` subdirectory. These screenshots are artifacts from the `test_character_edit` e2e test and the test file (`e2e-tests/test_character_edit.md`) already references them under `e2e-screenshots/character_edit/`. The files must be moved to the correct directory and the extra unreferenced file (`04_apply_cancel_visible.png`) must be removed.

## Summary of Original Implementation Plan
The original plan is at `specs/issue-182-adw-unknown-sdlc_planner-dedicated-app-instance-per-worktree.md`. It specifies:

- Create `adws/core/portAllocator.ts` to allocate a random available port per worktree
- Add `applicationUrl` to `WorkflowConfig` and thread it through all agents, phases, and slash commands
- Update slash commands (`prepare_app.md`, `test_e2e.md`, `start.md`, `review.md`, `resolve_failed_e2e_test.md`) to accept dynamic ports
- Update e2e test files to use `applicationUrl` instead of hardcoded `localhost:3000`
- Update existing tests and add a new `portAllocator.test.ts`
- Validate with `npm run lint`, `npm run build`, `npm test`

## Relevant Files
Use these files to resolve the review:

- `01_home_page.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/01_home_page.png`. Referenced in `e2e-tests/test_character_edit.md` line 71.
- `02_character_detail.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/02_character_detail.png`. Referenced in `e2e-tests/test_character_edit.md` line 72.
- `03_field_editing.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/03_field_editing.png`. Referenced in `e2e-tests/test_character_edit.md` line 73.
- `04_cancel_edit.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/04_cancel_edit.png`. Referenced in `e2e-tests/test_character_edit.md` line 74.
- `04_apply_cancel_visible.png` (project root) — Unreferenced screenshot with no matching entry in any e2e test file. Should be deleted.
- `05_apply_edit.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/05_apply_edit.png`. Referenced in `e2e-tests/test_character_edit.md` line 75.
- `06_after_refresh.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/06_after_refresh.png`. Referenced in `e2e-tests/test_character_edit.md` line 76.
- `07_restored_state.png` (project root) — Misplaced screenshot, should be at `e2e-screenshots/character_edit/07_restored_state.png`. Referenced in `e2e-tests/test_character_edit.md` line 77.
- `e2e-screenshots/character_edit/` — Target directory where the screenshots belong. Already contains older screenshots from a previous test run.
- `e2e-tests/test_character_edit.md` — E2e test spec that references the expected screenshot paths under `e2e-screenshots/character_edit/`.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Move referenced PNG files from project root to `e2e-screenshots/character_edit/`

- Move the following 7 files from the project root to `e2e-screenshots/character_edit/`, overwriting any existing files with the same name:
  - `git mv -f 01_home_page.png e2e-screenshots/character_edit/01_home_page.png`
  - `git mv -f 02_character_detail.png e2e-screenshots/character_edit/02_character_detail.png`
  - `git mv -f 03_field_editing.png e2e-screenshots/character_edit/03_field_editing.png`
  - `git mv -f 04_cancel_edit.png e2e-screenshots/character_edit/04_cancel_edit.png`
  - `git mv -f 05_apply_edit.png e2e-screenshots/character_edit/05_apply_edit.png`
  - `git mv -f 06_after_refresh.png e2e-screenshots/character_edit/06_after_refresh.png`
  - `git mv -f 07_restored_state.png e2e-screenshots/character_edit/07_restored_state.png`

### Step 2: Remove the unreferenced `04_apply_cancel_visible.png`

- Delete `04_apply_cancel_visible.png` from the project root since it is not referenced by any e2e test file:
  - `git rm 04_apply_cancel_visible.png`

### Step 3: Clean up stale screenshots in `e2e-screenshots/character_edit/`

- After moving the new screenshots in, remove any old screenshots that no longer match the expected filenames in `e2e-tests/test_character_edit.md`. The test expects exactly these 7 files:
  - `01_home_page.png`
  - `02_character_detail.png`
  - `03_field_editing.png`
  - `04_cancel_edit.png`
  - `05_apply_edit.png`
  - `06_after_refresh.png`
  - `07_restored_state.png`
- Remove stale files that don't match (the old screenshots from a previous run):
  - `git rm e2e-screenshots/character_edit/01_home_page_overview.png`
  - `git rm e2e-screenshots/character_edit/02_character_detail_page.png`
  - `git rm e2e-screenshots/character_edit/03_field_editing_mode.png`
  - `git rm e2e-screenshots/character_edit/04_apply_cancel_buttons.png`
  - `git rm e2e-screenshots/character_edit/05_after_cancel.png`
  - `git rm e2e-screenshots/character_edit/06_after_apply_error.png`

### Step 4: Verify no PNG files remain in the project root

- Run `ls *.png` in the project root and confirm no PNG files exist
- Run `ls e2e-screenshots/character_edit/` and confirm only the 7 expected files exist

### Step 5: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to validate zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `ls *.png 2>/dev/null | wc -l` - Verify zero PNG files remain in project root (expect 0)
- `ls e2e-screenshots/character_edit/` - Verify correct screenshots are in place
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The first review comment (missing `tokenLimitRecovery.test.ts` and `route.ts`) was already resolved in prior commits (`7f91f54` committed the test fix, `route.ts` changes were reverted). No further action is needed.
- The `e2e-screenshots/character_edit/` directory currently contains 6 old screenshots with different naming conventions (e.g., `01_home_page_overview.png` vs `01_home_page.png`). Step 3 cleans these up since they are from a previous test run and the current test spec references the new names.
- `04_apply_cancel_visible.png` has no reference in any test file and appears to be an intermediate screenshot that was captured but not included in the test spec. It should be deleted to avoid clutter.
