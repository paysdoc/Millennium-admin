# PR-Review: Remove PII Anonymization from Character and Connection Tables

## PR-Review Description
The PR review comment from paysdoc on `scripts/sync-config.ts` line 23 indicates that the `character` and `connection` tables do not contain PII data. These tables store historical data that is public knowledge, so the PII anonymization rules configured for these tables are unnecessary and should be removed. The sync script should copy this data as-is without any anonymization.

## Summary of Original Implementation Plan
The original implementation plan (`specs/issue-71-plan.md`) created a Supabase data sync system with the following key components:
- TypeScript sync script (`scripts/sync-supabase.ts`) to copy production data to staging
- Configuration file (`scripts/sync-config.ts`) defining tables to sync with PII field mappings
- PII anonymization logic for sensitive fields (names, text content)
- GitHub Action for monthly automated synchronization
- Explicit exclusion of the `users` table for privacy

The plan configured PII anonymization for `character` (fields: `first_names`, `biography`) and `connection` (fields: `why`, `why_short`) tables. However, per the review, this anonymization is not needed since the data is historical public knowledge.

## Relevant Files
Use these files to resolve the review:

- `scripts/sync-config.ts` - Contains the table configurations with PII field mappings that need to be updated. The `characterTable` and `connectionTable` definitions need their PII fields removed.
- `scripts/sync-types.ts` - Contains TypeScript types for sync configuration. May need to verify if `TableConfig` can support empty PII field mappings.
- `scripts/sync-supabase.ts` - Main sync script that uses the configuration. Should already handle tables with no PII fields correctly, but verify behavior.
- `scripts/__tests__/sync-supabase.test.ts` - Unit tests that may need updating if they test PII anonymization for character/connection fields.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update character table configuration
- Modify `scripts/sync-config.ts` to remove PII field mappings from `characterTable`
- Change `characterTable` to use an empty array for `piiFieldEntries`
- Update the JSDoc comment above `characterTable` to reflect that this table contains public historical data

### Step 2: Update connection table configuration
- Modify `scripts/sync-config.ts` to remove PII field mappings from `connectionTable`
- Change `connectionTable` to use an empty array for `piiFieldEntries`
- Update the JSDoc comment above `connectionTable` to reflect that this table contains public historical data

### Step 3: Verify sync script handles empty PII fields correctly
- Read `scripts/sync-supabase.ts` to verify the anonymization logic handles tables with no PII fields
- The script should simply copy data without transformation when `piiFields` map is empty
- Make corrections if needed to handle the empty case

### Step 4: Update unit tests
- Update `scripts/__tests__/sync-supabase.test.ts` test "has PII field configuration for character table" (lines 237-245):
  - Rename test to "has no PII fields for character table (public historical data)"
  - Change assertions to verify `piiFields.size` equals 0 instead of checking for specific fields
- Update test "has PII field configuration for connection table" (lines 247-255):
  - Rename test to "has no PII fields for connection table (public historical data)"
  - Change assertions to verify `piiFields.size` equals 0 instead of checking for specific fields

### Step 5: Run validation commands
- Run all validation commands to ensure the changes are correct and introduce no regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `users` table remains excluded from sync as per original requirements - this is actual user data that should not be synced.
- The sync script architecture remains unchanged; only the configuration data is being modified.
- If future tables with actual PII are added, the same `createTableConfig` pattern can still be used with populated PII field mappings.
- This change simplifies the sync process for character and connection tables by eliminating unnecessary anonymization overhead.
