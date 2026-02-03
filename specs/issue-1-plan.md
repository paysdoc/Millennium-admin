# PR-Review: Fix Missing Characters Table and Add E2E Test

## PR-Review Description
PR #42 implementing the characters overview page now encounters a runtime error when the application runs: `Failed to fetch characters: Could not find the table 'public.characters' in the schema cache`. This error indicates the `characters` table does not exist in the Supabase database. Additionally, the reviewer has requested an e2e test to ensure the page works correctly.

The current implementation correctly uses lazy initialization for the Supabase client (which was addressed in the previous revision), but the underlying database table was never created. The application expects a `characters` table with columns: `id`, `name`, and `category`.

## Summary of Original Implementation Plan
The original plan (issue #1) implemented a Characters Overview Page that:
- Fetches character data from Supabase `characters` table
- Groups characters by category in a specific order (R, S, P, I, M, N, A, B, C, D, T)
- Sorts characters alphabetically within each category
- Displays them in a Wikipedia-style layout with table of contents
- Extracts reusable Header and Footer components
- Uses server-side data fetching in Next.js server components

The implementation created `src/lib/supabase.ts` for client initialization and `src/lib/characters.ts` for data fetching. The lazy initialization fix has been applied, but the database table was never provisioned.

## Relevant Files
Use these files to resolve the review:

- `src/lib/supabase.ts` - Supabase client initialization; already uses lazy initialization pattern
- `src/lib/characters.ts` - Character data fetching functions; queries the `characters` table
- `src/types/character.ts` - Defines Character interface with `id`, `name`, `category` fields and category constants
- `src/app/page.tsx` - Home page that displays the characters overview; handles errors gracefully
- `.env.sample` - Contains Supabase URL reference for database connection

### New Files
- `supabase/migrations/001_create_characters_table.sql` - SQL migration to create the characters table
- `e2e-tests/test_characters_overview.md` - E2E test for the characters overview page functionality

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create Supabase migrations directory structure
Create the `supabase/migrations/` directory to store database migration scripts:
- Create directory `supabase/migrations/`
- This follows Supabase's conventional structure for database migrations

### Step 2: Create the characters table migration script
Create `supabase/migrations/001_create_characters_table.sql` with the following schema:
- `id` - UUID primary key with default gen_random_uuid()
- `name` - TEXT NOT NULL for character name
- `category` - TEXT NOT NULL for category classification (R, S, P, I, M, N, A, B, C, D, T)
- `created_at` - TIMESTAMPTZ with default now() for audit purposes
- Add a CHECK constraint to validate category values match the expected set
- Enable Row Level Security (RLS) with a permissive SELECT policy for public read access
- Insert sample data for testing (at least 2-3 characters per category to demonstrate grouping)

Example schema:
```sql
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('R', 'S', 'P', 'I', 'M', 'N', 'A', 'B', 'C', 'D', 'T')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON public.characters
  FOR SELECT USING (true);

-- Insert sample characters for each category
INSERT INTO public.characters (name, category) VALUES
  ('Alice', 'R'),
  ('Bob', 'R'),
  ('Charlie', 'S'),
  -- ... additional sample data
```

### Step 3: Execute the migration in Supabase
Apply the migration to the Supabase database:
- Use the Supabase URL from `.env.sample`: `https://gownillwfbtrbnkrvrxi.supabase.co`
- Execute the migration SQL via Supabase Dashboard SQL Editor or using the Supabase CLI
- For manual execution: Navigate to Supabase Dashboard → SQL Editor → Run the migration script
- Verify the table was created by querying: `SELECT * FROM public.characters LIMIT 5;`

### Step 4: Create E2E test for characters overview page
Create `e2e-tests/test_characters_overview.md` following the project's E2E test format (see `.claude/commands/test_e2e.md`):

The E2E test should include:
- **User Story**: As a user, I want to view a list of characters grouped by category
- **Test Steps**:
  1. Navigate to the home page (http://localhost:3000)
  2. Verify the page title "Millennium Characters Overview" is displayed
  3. Verify the table of contents is visible with category links
  4. Verify character sections are displayed grouped by category
  5. Verify characters are sorted alphabetically within each category
  6. Click a table of contents link and verify smooth scroll to section
  7. Capture screenshots at key steps
- **Success Criteria**:
  - Page loads without error states
  - Table of contents renders with category links
  - At least one character category section is visible
  - No error messages displayed
- **Output Format**: JSON with test_name, status, screenshots, error

### Step 5: Run validation commands
Execute the validation commands to ensure the changes work correctly:
- `npm run lint` - Verify no linting errors
- `npm run build` - Verify the build succeeds
- `npm test` - Verify all tests pass with zero regressions
- Start the dev server and manually verify the page loads without errors

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Database Setup Required**: Unlike code changes that can be validated locally, the database migration requires access to the Supabase project. The migration must be run in the Supabase Dashboard SQL Editor or via Supabase CLI with appropriate credentials.
- **SUPABASE_SERVICE_KEY**: For migration execution via code, the `SUPABASE_SERVICE_KEY` (service role key) may be needed as it bypasses RLS policies. The regular `SUPABASE_KEY` (anon key) respects RLS policies.
- **Sample Data**: The migration includes sample character data to enable immediate testing. In production, this data can be managed through an admin interface.
- **E2E Test Pattern**: The project uses markdown-based E2E test specifications in `e2e-tests/` directory, executed via the `/test_e2e` command which uses Playwright browser automation through MCP Server.
- **RLS Policy**: The public read access policy allows the frontend to fetch characters using the anon key, which is appropriate for a public-facing character directory.
