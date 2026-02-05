# Chore: Create SQL script to migrate image links

## Chore Description
Create a SQL migration script under `/scripts` to update the `image_link` column in the `character` table. The script will migrate all records from the old path format `'data/character_images/[...]'` to the new format `'character_images/[...]'` by removing the `data/` prefix from the path.

## Relevant Files
Use these files to resolve the chore:

- `src/types/character.ts` - Contains the `CharacterRow` and `Character` interfaces that define the `image_link` column as `string | null`. Useful for understanding the data structure.
- `src/lib/supabase.ts` - Contains the Supabase client configuration. Shows how the application connects to the database.
- `src/lib/characters.ts` - Contains the character data fetching logic including the `image_link` field. Confirms the table is named `character`.
- `src/components/CharacterDetails.tsx` - Uses `character.image_link` to display images. Confirms this is the field being used in the application.

### New Files
- `scripts/migrate-image-links.sql` - New SQL script to perform the image link migration.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the scripts directory
- Create a new `scripts/` directory in the project root.
- This directory will contain database migration scripts.

### Step 2: Create the SQL migration script
- Create `scripts/migrate-image-links.sql` with the following content:
  - Add a header comment explaining the purpose of the migration.
  - Add a `SELECT` query to preview which records will be affected (records where `image_link` starts with `'data/character_images/'`).
  - Add an `UPDATE` statement to replace `'data/character_images/'` with `'character_images/'` in the `image_link` column.
  - Use PostgreSQL's `REPLACE()` function or string manipulation to update the path prefix.
  - Include a `WHERE` clause to only update records that match the old format (`image_link LIKE 'data/character_images/%'`).
  - Add comments explaining each step for future reference.

### Step 3: Add script documentation
- Add a comment block at the top of the SQL file with:
  - Description of what the migration does
  - Instructions for running the script in Supabase SQL Editor
  - Warning to backup data before running
  - Expected before/after examples of the `image_link` values

### Step 4: Run validation commands
- Run all validation commands to verify the chore is complete with zero regressions.
- The SQL file itself doesn't require linting or building, but we must ensure no accidental changes were made to other files.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- The SQL script should be idempotent - running it multiple times should not cause issues (the `WHERE` clause ensures only records with the old format are updated).
- The script is designed to be run manually via the Supabase SQL Editor dashboard, not as an automated migration.
- Records where `image_link` is `NULL` or already in the new format will not be affected.
- Example transformation:
  - Before: `data/character_images/john_doe.jpg`
  - After: `character_images/john_doe.jpg`
- The character table uses UUID for the `id` column based on the type definition (`id: string`).
