# Feature: Replace Dynamic Database Structure with Static Model

## Feature Description
Replace the current dynamic database schema discovery approach with a static TypeScript data model derived from the provided SQL files. This improves performance by eliminating runtime schema introspection calls and provides better type safety through strongly-typed interfaces for the `character` and `connection` tables. The static model will be based on the actual database schema defined in the SQL files, ensuring queries are correctly typed and validated at compile time.

## User Story
As a developer
I want to use statically-typed data models for database queries
So that I can improve application performance and get compile-time type safety for database operations

## Problem Statement
The current implementation relies on dynamic schema discovery through RPC calls (`get_public_tables`, `get_table_columns`) to determine database structure at runtime. This approach:
1. Adds latency to every page load due to metadata queries
2. Provides no compile-time type safety for database operations
3. Queries the wrong table name (`characters` instead of `character`)
4. Uses an incomplete data model (only `id`, `name`, `category` fields)
5. Does not include the `connection` table at all

## Solution Statement
Create comprehensive TypeScript interfaces that mirror the actual database schema from the SQL files. Update the data fetching layer to:
1. Use the correct table name (`character` instead of `characters`)
2. Include all available columns in the data model
3. Add a new `Connection` model for the connections table
4. Map the database `type` column to the existing `category` concept
5. Remove or simplify the dynamic schema discovery code
6. Provide strong typing for all database operations

## Relevant Files
Use these files to implement the feature:

- `src/types/character.ts` - Current character types; needs expansion to match full SQL schema with all columns (name, first_names, birth_date, death_date, biography, type, link, image_link, id, joker fields)
- `src/lib/characters.ts` - Character data fetching; needs to query `character` table (not `characters`) and select all columns
- `src/lib/schema.ts` - Dynamic schema discovery; can be simplified or removed since we're using static models
- `src/lib/supabase.ts` - Supabase client; may need type generation integration
- `src/app/page.tsx` - Home page; uses character data, may need updates for new field mappings
- `src/components/CategorySection.tsx` - Displays characters; may benefit from additional fields

### New Files
- `src/types/connection.ts` - New TypeScript interface for the connection table model
- `src/types/database.ts` - Central database types file that combines all table models
- `.claude/commands/e2e/test_overview_minimum_rows.md` - E2E test to verify overview displays at least 10 rows

## Implementation Plan
### Phase 1: Foundation
Create the static TypeScript data models based on the SQL file schemas. This includes defining interfaces for both `character` and `connection` tables with proper TypeScript types for each column.

### Phase 2: Core Implementation
Update the data fetching layer to use the new static models:
- Fix the table name from `characters` to `character`
- Update queries to select all available columns
- Map the `type` database column to the application's `category` concept
- Add connection fetching capabilities

### Phase 3: Integration
- Simplify or remove dynamic schema discovery code
- Update components to work with the expanded data model
- Create E2E test to validate the overview page displays data correctly

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the E2E test specification
Create the E2E test file that validates the overview page displays at least 10 rows:
- Create `.claude/commands/e2e/test_overview_minimum_rows.md`
- Test navigates to the overview page
- Test verifies at least 10 character rows are visible
- Test takes screenshots to document the verification

### Step 2: Create the static Character model
Update `src/types/character.ts` with the complete schema from the SQL file:
- Add all columns: `id`, `name`, `first_names`, `birth_date`, `death_date`, `biography`, `type`, `link`, `image_link`, `joker_type`, `joker_type_value`, `joke_type_why`, `joker_type_why_short`
- Use appropriate TypeScript types (string, number, Date | null, etc.)
- Keep the existing `CATEGORY_ORDER` and related types
- Add a type alias mapping `type` to `category` for compatibility

### Step 3: Create the static Connection model
Create `src/types/connection.ts` with the connection table schema:
- Define `Connection` interface with: `id`, `char1_id`, `char2_id`, `value`, `why`, `why_short`, `active`
- Use appropriate TypeScript types for each field
- Export the interface for use in queries

### Step 4: Create centralized database types
Create `src/types/database.ts` to consolidate all database models:
- Re-export `Character` and related types from `character.ts`
- Re-export `Connection` from `connection.ts`
- Define a `Database` type for Supabase client typing (optional enhancement)

### Step 5: Update the characters data fetching
Update `src/lib/characters.ts`:
- Change table name from `characters` to `character`
- Update the select statement to include all character columns
- Map the `type` column to `category` in the returned data
- Update the `fetchAllCharacters()` function return type
- Ensure proper error handling is maintained

### Step 6: Add connection data fetching
Create `src/lib/connections.ts`:
- Create `fetchAllConnections()` function to query the `connection` table
- Create `fetchConnectionsByCharacter(characterId: string)` for filtered queries
- Use the static `Connection` type for return values
- Include proper error handling following the existing pattern

### Step 7: Simplify schema discovery
Update `src/lib/schema.ts`:
- Keep the `isTableNotFoundError` utility function (still useful for error handling)
- Mark dynamic schema functions as deprecated or remove them
- Add comments indicating the switch to static models

### Step 8: Update the overview page if needed
Review `src/app/page.tsx`:
- Verify it works correctly with the updated data model
- The `type` to `category` mapping should be handled in the data layer
- No changes expected if mapping is done correctly in `characters.ts`

### Step 9: Run validation commands
Execute all validation commands to ensure zero regressions:
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to ensure all tests pass

### Step 10: Run E2E test to verify feature
Execute the E2E test to validate the implementation:
- Run the `test_overview_minimum_rows` E2E test
- Verify the overview page displays at least 10 character rows
- Capture screenshots as documentation

## Testing Strategy
### Unit Tests
- Test that `fetchAllCharacters()` returns properly typed `Character` objects
- Test that `fetchAllConnections()` returns properly typed `Connection` objects
- Test the `type` to `category` mapping works correctly
- Test error handling when tables don't exist

### Integration Tests
- Test that the overview page correctly displays characters from the database
- Test that characters are grouped by category correctly
- Test that the page handles empty database gracefully

### Edge Cases
- Empty database (no characters or connections)
- Database with characters but no connections
- Characters with null optional fields (birth_date, death_date, joker fields)
- Invalid category/type values in database

## Acceptance Criteria
- The `character` table is queried instead of `characters`
- All character fields from the SQL schema are available in the TypeScript model
- A new `Connection` interface exists matching the connection table schema
- The overview page displays character data correctly
- The E2E test confirms at least 10 rows are displayed on the overview page
- `npm run lint` passes with no errors
- `npm run build` completes successfully
- `npm test` passes with zero regressions
- Dynamic schema discovery is simplified or removed

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- **Table Name Correction**: The SQL files define a `character` table (singular), but the current code queries `characters` (plural). This is a critical fix.
- **Type/Category Mapping**: The database uses `type` column with single-letter codes (R, S, P, etc.), which maps to the application's `category` concept. The existing `CATEGORY_ORDER` constant already defines these codes.
- **Nullable Fields**: Many character fields are nullable (birth_date, death_date, joker fields). The TypeScript model should use `| null` appropriately.
- **Performance Improvement**: Removing dynamic schema discovery eliminates RPC calls on each page load, improving performance.
- **Backward Compatibility**: The `isTableNotFoundError` utility should be retained for graceful error handling when tables don't exist.
- **SQL File Data**: The character_rows.sql contains 277 records and connection_rows.sql contains 1,180+ records. The E2E test threshold of 10 rows is conservative and should easily pass with actual data.
