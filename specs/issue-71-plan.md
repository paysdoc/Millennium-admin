# PR-Review: Add Additional Tables to Sync Configuration

## PR-Review Description
The PR review on `scripts/sync-config.ts` contains two comments from paysdoc:

1. **Line 23:** Confirms that `character` and `connection` tables do not have PII data - these are historical data that are public knowledge. This comment has already been addressed in the current implementation.

2. **Line 43:** Requests adding three additional tables to the sync configuration:
   - `game_players` - No PII, sync as-is
   - `games` - No PII, sync as-is
   - `profiles` - Contains PII data, requires anonymization

The second comment requires implementation changes to add these three new tables to the `syncConfig.tablesToSync` array with appropriate PII handling.

## Summary of Original Implementation Plan
The original implementation plan created a Supabase data sync system with the following key components:
- TypeScript sync script (`scripts/sync-supabase.ts`) to copy production data to staging
- Configuration file (`scripts/sync-config.ts`) defining tables to sync with PII field mappings
- PII anonymization logic for sensitive fields (names, text content)
- GitHub Action for monthly automated synchronization
- Explicit exclusion of the `users` table for privacy

The current implementation syncs `character` and `connection` tables (both with no PII fields) and excludes the `users` table. The architecture supports adding new tables with or without PII anonymization.

## Relevant Files
Use these files to resolve the review:

- `scripts/sync-config.ts` - Main configuration file where new table definitions need to be added. Must add `game_players`, `games`, and `profiles` table configurations.
- `scripts/__tests__/sync-supabase.test.ts` - Unit tests that need to be updated to verify the new table configurations are properly set up.
- `scripts/sync-supabase.ts` - Main sync script. No changes needed as it already handles tables with and without PII fields correctly.
- `scripts/sync-types.ts` - Type definitions. No changes needed as existing types support the new configurations.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add game_players table configuration
- In `scripts/sync-config.ts`, add a new table configuration for `game_players`
- Use `createTableConfig('game_players', [])` since this table has no PII data
- Add a JSDoc comment explaining this table contains game player relationship data

### Step 2: Add games table configuration
- In `scripts/sync-config.ts`, add a new table configuration for `games`
- Use `createTableConfig('games', [])` since this table has no PII data
- Add a JSDoc comment explaining this table contains game data

### Step 3: Add profiles table configuration with PII anonymization
- In `scripts/sync-config.ts`, add a new table configuration for `profiles`
- Configure PII fields for anonymization. Based on typical profile tables, include:
  - `username` field with 'name' anonymization rule
  - `display_name` field with 'name' anonymization rule (if exists)
  - `full_name` field with 'name' anonymization rule (if exists)
  - `bio` field with 'text' anonymization rule (if exists)
- Add a JSDoc comment explaining this table contains user profile data requiring PII anonymization
- Note: The exact PII field names should be confirmed against the actual Supabase schema. If uncertain, start with common profile fields like `username`, `display_name`, `full_name`, and `bio`.

### Step 4: Update tablesToSync array
- In `scripts/sync-config.ts`, update the `tablesToSync` array to include all five tables:
  - `characterTable`
  - `connectionTable`
  - `gamePlayersTable`
  - `gamesTable`
  - `profilesTable`

### Step 5: Add unit tests for new table configurations
- In `scripts/__tests__/sync-supabase.test.ts`, add tests for `game_players` table:
  - Test that `syncConfig.tablesToSync` includes `game_players`
  - Test that `game_players` has no PII fields (size 0)
  - Test that `getTableConfig('game_players')` returns the correct config

- Add tests for `games` table:
  - Test that `syncConfig.tablesToSync` includes `games`
  - Test that `games` has no PII fields (size 0)
  - Test that `getTableConfig('games')` returns the correct config

- Add tests for `profiles` table:
  - Test that `syncConfig.tablesToSync` includes `profiles`
  - Test that `profiles` has PII fields configured (size > 0)
  - Test that PII fields include the expected field names with correct anonymization rules
  - Test that `getTableConfig('profiles')` returns the correct config

### Step 6: Update isTableAllowed tests
- In `scripts/__tests__/sync-supabase.test.ts`, update the `isTableAllowed` test that checks non-excluded tables to include the new tables:
  - `game_players`
  - `games`
  - `profiles`

### Step 7: Run validation commands
- Run all validation commands to ensure the changes are correct and introduce no regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `users` table remains excluded from sync as per original requirements - this is actual user authentication data that should never be synced.
- The `profiles` table PII field configuration should be verified against the actual Supabase schema. Common profile fields like `username`, `display_name`, `full_name`, and `bio` are good starting points but may need adjustment based on the actual table structure.
- The sync script architecture (pagination, batching, anonymization) remains unchanged - only configuration is being extended.
- If the Supabase schema for `profiles` uses different field names, update Step 3 accordingly before implementation.
- The existing anonymization functions (`anonymizeName` for names, `anonymizeText` for text content) support the `profiles` table PII requirements without modification.
