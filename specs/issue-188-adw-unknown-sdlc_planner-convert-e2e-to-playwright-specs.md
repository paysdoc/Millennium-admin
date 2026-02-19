# Chore: Convert E2E tests from Playwright MCP to Playwright test specs

## Metadata
issueNumber: `188`
adwId: `adw-unknown`
issueJson: `{"title":"Don't use AI for e2e tests","body":"Currently the e2e tests are being run using markdown files and the playwright MCP. I think this takes too much time and tokens. Add playwright as dev dependency to the project and convert the current .md to playwright specs. E2E tests can then run as a standalone test.\n\nThe results should be analyzed and, if necessary, resolve failing tests the same way that it is currently being resolved.\n\nIf it is no longer used, the Playwright MCP can be removed."}`

## Chore Description
The project currently defines E2E tests as markdown files in `e2e-tests/` and executes them via the Playwright MCP (Model Context Protocol) integration through Claude Code agents. This approach is expensive in terms of time and tokens because each test run requires an LLM to interpret markdown instructions and drive a browser via MCP.

This chore converts the 4 existing markdown E2E test files into proper Playwright test specs (`.spec.ts` files) that can be run standalone with `npx playwright test`. The ADW integration in `testAgent.ts` and `testRetry.ts` is updated to discover and run `.spec.ts` files via subprocess instead of spawning Claude agents. The Playwright MCP configuration is removed since it is no longer needed. The `/resolve_failed_e2e_test` command remains for AI-powered resolution of failing E2E tests, but `/test_e2e` is removed since tests now run via `npm run test:e2e`.

## Relevant Files
Use these files to resolve the chore:

- `package.json` - Add `@playwright/test` as a dev dependency and add `test:e2e` npm script
- `vitest.config.ts` - May need to exclude `e2e-tests/` from vitest discovery
- `.mcp.json` - Remove the Playwright MCP server configuration (file can be deleted if empty)
- `e2e-tests/test_characters_overview.md` - Source for characters overview Playwright spec (will be deleted)
- `e2e-tests/test_character_detail.md` - Source for character detail Playwright spec (will be deleted)
- `e2e-tests/test_character_edit.md` - Source for character edit Playwright spec (will be deleted)
- `e2e-tests/test_character_image_display.md` - Source for character image display Playwright spec (will be deleted)
- `adws/agents/testAgent.ts` - Update E2E test discovery to find `.spec.ts` files and run them via `npx playwright test` subprocess; remove `runE2ETestAgent` and `runResolveE2ETestAgent` functions that depend on Claude agent execution; update `E2ETestResult` interface
- `adws/agents/testRetry.ts` - Update `runE2ETestsWithRetry` to run Playwright via subprocess and parse JSON results; remove dependency on `runE2ETestAgent`; keep resolution logic using `/resolve_failed_e2e_test` for AI-powered failure resolution
- `adws/agents/index.ts` - Update exports to reflect removed/changed functions
- `adws/__tests__/testAgent.test.ts` - Update unit tests for the new E2E discovery and execution approach
- `adws/core/config.ts` - Remove `/test_e2e` from `SLASH_COMMAND_MODEL_MAP`
- `adws/core/issueTypes.ts` - Remove `/test_e2e` from `SlashCommand` type
- `.claude/commands/test_e2e.md` - Delete (no longer needed)
- `.claude/commands/e2e-examples/test_basic_query.md` - Delete (no longer needed)
- `.claude/commands/e2e-examples/test_complex_query.md` - Delete (no longer needed)
- `.claude/commands/resolve_failed_e2e_test.md` - Keep as-is for AI-powered failure resolution
- `src/app/page.tsx` - Reference for understanding page structure (read-only)
- `src/app/characters/[id]/page.tsx` - Reference for understanding character detail page (read-only)
- `src/components/EditableCharacterDetails.tsx` - Reference for understanding edit functionality (read-only)
- `src/components/CharacterImage.tsx` - Reference for understanding image display (read-only)
- `src/components/Header.tsx` - Reference for understanding header component (read-only)
- `src/components/Footer.tsx` - Reference for understanding footer component (read-only)
- `src/components/CategorySection.tsx` - Reference for understanding category sections (read-only)
- `src/components/TableOfContents.tsx` - Reference for understanding table of contents (read-only)
- `src/components/ConnectionsTable.tsx` - Reference for understanding connections table (read-only)
- `guidelines/coding_guidelines.md` - Must follow all coding guidelines

### New Files
- `playwright.config.ts` - Playwright configuration file (headless, 1920x1080 viewport, baseURL from env or localhost:3000)
- `e2e-tests/characters-overview.spec.ts` - Playwright spec for characters overview page
- `e2e-tests/character-detail.spec.ts` - Playwright spec for character detail page
- `e2e-tests/character-edit.spec.ts` - Playwright spec for character edit functionality
- `e2e-tests/character-image-display.spec.ts` - Playwright spec for character image display

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Install Playwright and configure the project

- Run `npm install --save-dev @playwright/test` to add Playwright as a dev dependency
- Run `npx playwright install chromium` to install the Chromium browser for Playwright
- Create `playwright.config.ts` at the project root with the following configuration:
  - `testDir`: `'./e2e-tests'`
  - `testMatch`: `'**/*.spec.ts'`
  - `fullyParallel`: `false` (tests may depend on database state, run sequentially)
  - `retries`: `0` (retries are handled by the ADW system)
  - `use.baseURL`: `process.env.E2E_BASE_URL || 'http://localhost:3000'`
  - `use.headless`: `true`
  - `use.viewport`: `{ width: 1920, height: 1080 }`
  - `use.screenshot`: `'only-on-failure'`
  - `reporter`: `[['list'], ['json', { outputFile: 'e2e-results.json' }]]` (JSON output for ADW parsing)
  - `outputDir`: `'e2e-results'`
  - `projects`: single project with `name: 'chromium'`, `use: { ...devices['Desktop Chrome'] }`
- Add `test:e2e` script to `package.json`: `"test:e2e": "playwright test"`
- Update `vitest.config.ts` to also exclude `e2e-tests` from vitest discovery by adding `'**/e2e-tests/**'` to the `exclude` array
- Add `e2e-results/`, `e2e-results.json`, and `test-results/` to `.gitignore` if not already present

### Step 2: Convert `test_characters_overview.md` to `characters-overview.spec.ts`

- Create `e2e-tests/characters-overview.spec.ts`
- Read `src/app/page.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/CategorySection.tsx`, `src/components/TableOfContents.tsx` to understand exact selectors and text content
- Translate the markdown test steps into Playwright assertions:
  - Navigate to `/` (uses baseURL from config)
  - Verify the Header component is visible
  - Verify the page title "Millennium Characters Overview" is displayed
  - Check content state: characters grouped by category, OR "No characters found", OR error message
  - If characters exist, verify table of contents sidebar with category links
  - If characters exist, verify at least one category section with characters listed
  - Scroll to bottom, verify Footer is visible
- Use `page.goto('/')`, `page.locator()`, `expect(locator).toBeVisible()`, etc.
- Use `test.describe` and `test` blocks following Playwright conventions
- Do NOT take screenshots in the spec (screenshots are handled by Playwright config on failure)

### Step 3: Convert `test_character_detail.md` to `character-detail.spec.ts`

- Create `e2e-tests/character-detail.spec.ts`
- Read `src/app/characters/[id]/page.tsx`, `src/components/CharacterDetails.tsx`, `src/components/ConnectionsTable.tsx` to understand selectors
- Translate the markdown test steps:
  - Navigate to `/`
  - Verify at least one category section is visible
  - Verify character names are clickable links
  - Click on a character name link
  - Verify URL contains `/characters/`
  - Verify character details section with name heading and infobox fields
  - Verify character image loads (if present) with Supabase storage URL
  - Verify connections section (table or empty state)
  - Verify "Back to Overview" link and click it
  - Verify navigation back to home page

### Step 4: Convert `test_character_edit.md` to `character-edit.spec.ts`

- Create `e2e-tests/character-edit.spec.ts`
- Read `src/components/EditableCharacterDetails.tsx`, `src/components/EditableField.tsx` to understand edit behavior and selectors
- Translate the markdown test steps:
  - Navigate to `/` and click a character link
  - Click on the "First Names" field value in the infobox
  - Verify field transforms into editable input
  - Modify field value by adding " Test"
  - Click outside to exit edit mode
  - Verify Apply and Cancel buttons appear
  - Click Cancel, verify value reset and buttons hidden
  - Click field again, add " Edited", click outside
  - Click Apply, verify changes saved (buttons disappear)
  - Reload page, verify edited value persists
  - Restore original value (remove " Edited", Apply)

### Step 5: Convert `test_character_image_display.md` to `character-image-display.spec.ts`

- Create `e2e-tests/character-image-display.spec.ts`
- Read `src/components/CharacterImage.tsx` to understand image rendering
- Translate the markdown test steps:
  - Navigate to `/` and click a character link
  - Verify character detail page layout: infobox on left, image on right
  - Verify image display properties: max width 450px, Supabase storage URL, successful load
  - Verify layout alignment (infobox and image top-aligned)
  - Navigate back to overview

### Step 6: Delete markdown test files and MCP configuration

- Delete `e2e-tests/test_characters_overview.md`
- Delete `e2e-tests/test_character_detail.md`
- Delete `e2e-tests/test_character_edit.md`
- Delete `e2e-tests/test_character_image_display.md`
- Delete `.claude/commands/test_e2e.md`
- Delete `.claude/commands/e2e-examples/test_basic_query.md`
- Delete `.claude/commands/e2e-examples/test_complex_query.md`
- Delete the `.claude/commands/e2e-examples/` directory
- Delete `.mcp.json` (only contained the Playwright MCP config)

### Step 7: Update ADW E2E test agent (`testAgent.ts`)

- Update `discoverE2ETestFiles()` to look for `.spec.ts` files instead of `.md` files in the `e2e-tests/` directory
- Remove the `runE2ETestAgent()` function (no longer runs via Claude agent)
- Remove the `runResolveE2ETestAgent()` function (resolution will be called differently)
- Keep the `E2ETestResult` interface but update it to match Playwright JSON reporter output
- Add a new `runPlaywrightE2ETests()` function that:
  - Runs `npx playwright test` as a subprocess (using `child_process.spawn`)
  - Parses the JSON output from `e2e-results.json`
  - Returns structured results with pass/fail status per spec file
  - Captures stdout/stderr for logging
- Keep `isValidE2ETestResult()` utility function
- Remove the `E2ETestAgentResult` interface (no longer tied to Claude agent result)

### Step 8: Update ADW E2E test retry logic (`testRetry.ts`)

- Update `runE2ETestsWithRetry()` to:
  - Call the new `runPlaywrightE2ETests()` function instead of running individual tests via Claude
  - Parse Playwright JSON results to determine which specs failed
  - For each failing spec, call `runResolveE2ETestAgent()` (still uses Claude agent for resolution)
  - Re-run Playwright tests after resolution
- Keep the overall retry loop structure intact
- The resolution step still uses Claude AI via `/resolve_failed_e2e_test` command to analyze and fix failures

### Step 9: Update ADW configuration and types

- In `adws/core/config.ts`:
  - Remove `/test_e2e` entry from `SLASH_COMMAND_MODEL_MAP`
- In `adws/core/issueTypes.ts`:
  - Remove `'/test_e2e'` from the `SlashCommand` type union
- In `adws/agents/index.ts`:
  - Remove `runE2ETestAgent` export
  - Add `runPlaywrightE2ETests` export
  - Update type exports as needed

### Step 10: Update unit tests (`testAgent.test.ts`)

- Update `discoverE2ETestFiles` tests to expect `.spec.ts` files instead of `.md`
- Remove/replace `runE2ETestAgent` tests with tests for `runPlaywrightE2ETests`:
  - Test that it spawns `npx playwright test` subprocess
  - Test parsing of Playwright JSON output
  - Test handling of all tests passing
  - Test handling of test failures
- Keep `runResolveE2ETestAgent` tests as-is (function still exists)
- Keep `isValidE2ETestResult` tests as-is
- Update mock data to match new result shapes

### Step 11: Run validation commands

- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all unit tests pass with zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The Playwright specs should use idiomatic Playwright patterns: `test.describe()`, `test()`, `expect()`, `page.goto()`, `page.locator()`, `page.getByRole()`, `page.getByText()`, etc.
- When reading source components for selectors, prefer using accessible roles, text content, and data-testid attributes over CSS class selectors for more resilient tests.
- The `E2E_BASE_URL` environment variable allows running tests against different environments (local dev, staging).
- The `/resolve_failed_e2e_test` command is kept because AI-powered resolution of failing E2E tests is a valuable feature of the ADW system. The resolution agent receives failure details and can make targeted code fixes.
- The `e2e-results.json` file from Playwright's JSON reporter is what the ADW system parses to determine pass/fail status. This replaces the previous approach of parsing Claude agent JSON output.
- Files under `.playwright-mcp/` and `e2e-screenshots/` directories are historical artifacts from the MCP-based approach. They can be cleaned up separately if desired but are not part of this chore.
- Do NOT run `npm run test:e2e` as part of validation since it requires a running dev server with database. The validation focuses on ensuring the code compiles, lints, and unit tests pass.
