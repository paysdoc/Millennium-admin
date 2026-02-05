# Feature: Supabase Data Sync Script with Monthly Automation

## Feature Description
Create a database synchronization system for Supabase data that copies production data to a staging environment. The system includes a TypeScript sync script with PII anonymization capabilities, user table exclusion, and a GitHub Action for automated monthly synchronization. This ensures the staging environment has realistic test data while protecting sensitive information.

## User Story
As a developer
I want to sync production Supabase data to staging automatically
So that I can test with realistic data without exposing sensitive user information

## Problem Statement
The staging environment needs realistic data for testing and development purposes, but manually copying production data is tedious, error-prone, and risks exposing personally identifiable information (PII). Additionally, the data in staging becomes stale over time without a regular refresh mechanism.

## Solution Statement
Implement a TypeScript-based sync script that:
1. Connects to both production and staging Supabase instances
2. Exports data from specified production tables (excluding `users`)
3. Anonymizes PII fields (names, emails, etc.) before importing to staging
4. Clears existing staging data before importing to prevent duplicates
5. Runs via a GitHub Action on a monthly schedule with manual trigger option

## Relevant Files
Use these files to implement the feature:

- `src/lib/supabase.ts` - Reference for Supabase client initialization pattern
- `src/types/character.ts` - Character table schema for understanding data structure
- `src/types/connection.ts` - Connection table schema for understanding data structure
- `.env.sample` - Template for environment variables, needs staging URL added
- `.github/workflows/deploy.yml` - Reference for GitHub Actions workflow patterns used in project
- `package.json` - Add new npm script for sync command
- `adws/core/utils.ts` - Reference for utility patterns in TypeScript scripts

### New Files
- `scripts/sync-supabase.ts` - Main sync script with data export, anonymization, and import logic
- `scripts/sync-config.ts` - Configuration for tables to sync and PII field mappings
- `scripts/sync-types.ts` - TypeScript interfaces for sync operations
- `.github/workflows/sync-supabase.yml` - GitHub Action for monthly scheduled sync
- `scripts/__tests__/sync-supabase.test.ts` - Unit tests for sync script functions

## Implementation Plan
### Phase 1: Foundation
Set up the sync script infrastructure including configuration, types, and basic Supabase client connections for both production and staging environments. Add required environment variables and npm scripts.

### Phase 2: Core Implementation
Implement the sync logic including data fetching from production, PII anonymization functions, and data insertion to staging. Include proper error handling, logging, and rollback capabilities.

### Phase 3: Integration
Create the GitHub Action workflow for monthly automated execution with manual trigger support. Add documentation and ensure proper secret management with placeholders.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update environment configuration
- Add `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING` placeholders to `.env.sample`
- Add `SUPABASE_SERVICE_KEY_STAGING` placeholder for service role operations
- Document the new environment variables with comments

### Step 2: Create TypeScript types for sync operations
- Create `scripts/sync-types.ts` with interfaces for:
  - `SyncConfig` - Configuration for tables and field mappings
  - `TableConfig` - Per-table configuration including PII fields
  - `AnonymizationRule` - Rules for how to anonymize specific field types
  - `SyncResult` - Result type for tracking sync outcomes

### Step 3: Create sync configuration file
- Create `scripts/sync-config.ts` with:
  - List of tables to sync (`character`, `connection`)
  - Explicit exclusion of `users` table
  - PII field mappings for anonymization (e.g., `first_names`, `biography` in character table)
  - Export the configuration object

### Step 4: Implement the main sync script
- Create `scripts/sync-supabase.ts` with:
  - Function to create Supabase clients for both environments (production read, staging write)
  - Function to fetch all data from a production table
  - Function to anonymize PII fields based on configuration
  - Function to clear staging table before import
  - Function to insert anonymized data into staging
  - Main orchestration function that processes all configured tables
  - CLI entry point with proper error handling and logging
  - Exit codes for success (0) and failure (1)

### Step 5: Implement PII anonymization utilities
- Add anonymization functions to `scripts/sync-supabase.ts`:
  - `anonymizeName(name: string)` - Replace with fake name using hash-based determinism
  - `anonymizeText(text: string)` - Replace sensitive text content
  - `anonymizeField(value: unknown, rule: AnonymizationRule)` - Generic field anonymizer
  - Ensure deterministic anonymization (same input = same output) for referential integrity

### Step 6: Add npm script for sync command
- Update `package.json` to add:
  - `"sync:supabase": "tsx scripts/sync-supabase.ts"` script
  - This follows the existing pattern of using `tsx` for TypeScript scripts

### Step 7: Create GitHub Action for monthly sync
- Create `.github/workflows/sync-supabase.yml` with:
  - Cron schedule for monthly execution (1st of each month at midnight UTC)
  - Manual workflow dispatch trigger for on-demand syncs
  - Environment setup (Node.js 20, npm install)
  - Placeholder secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`
  - Run sync script with proper environment variables
  - Notification on failure (optional GitHub issue creation)

### Step 8: Create unit tests for sync functions
- Create `scripts/__tests__/sync-supabase.test.ts` with tests for:
  - PII anonymization functions (name, text)
  - Configuration validation
  - Table exclusion logic (verify users table is not synced)
  - Deterministic anonymization verification
  - Mock Supabase client interactions

### Step 9: Run validation commands
- Run all validation commands to verify implementation is complete with zero regressions
- Verify the script runs successfully in dry-run mode (if implemented)

## Testing Strategy
### Unit Tests
- Test all anonymization functions with various input types
- Test configuration loading and validation
- Test table filtering logic (users exclusion)
- Mock Supabase client for isolation testing

### Integration Tests
- Manual testing with actual Supabase instances (staging only)
- Verify data integrity after sync
- Verify PII fields are properly anonymized

### Edge Cases
- Empty tables - should sync without errors
- Large tables - should handle pagination if needed
- NULL values in PII fields - should handle gracefully
- Network failures - should provide clear error messages
- Missing environment variables - should fail fast with helpful message
- Tables that don't exist - should skip with warning

## Acceptance Criteria
- [ ] Sync script connects to both production and staging Supabase instances
- [ ] `character` and `connection` tables are synced successfully
- [ ] `users` table is explicitly excluded from sync
- [ ] PII fields (`first_names`, potentially `biography`) are anonymized
- [ ] Anonymization is deterministic (same input produces same output)
- [ ] Staging data is cleared before import to prevent duplicates
- [ ] GitHub Action runs monthly on schedule
- [ ] GitHub Action can be triggered manually
- [ ] All environment variables use placeholders in `.env.sample`
- [ ] Unit tests pass for anonymization functions
- [ ] Build, lint, and test commands pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions
- `npx tsx scripts/sync-supabase.ts --help` - Verify sync script is executable (if help flag is implemented)

## Notes
- **Security Considerations**: The sync script requires service role keys for both environments. These should NEVER be committed to the repository. Use GitHub Actions secrets for CI/CD.
- **PII Anonymization Strategy**: Using hash-based deterministic anonymization ensures that relationships between records are preserved (e.g., if the same name appears in multiple places, it will be anonymized to the same value).
- **Users Table**: Explicitly excluded per requirements. If user-related data is needed in staging, consider creating a separate seed script with fake user data.
- **Pagination**: For large tables, consider implementing pagination to avoid memory issues. Supabase has a default limit of 1000 rows per query.
- **Rollback**: If the sync fails mid-way, the staging database may be in an inconsistent state. Consider implementing transaction-like behavior or at minimum clear logging of progress.
- **Future Enhancements**:
  - Add `--dry-run` flag to preview changes without applying
  - Add `--table` flag to sync specific tables only
  - Add Slack/Discord notification on sync completion
  - Add data validation post-sync
- **Library Dependencies**: No new npm packages required. The existing `@supabase/supabase-js`, `dotenv`, and `tsx` dependencies are sufficient.
