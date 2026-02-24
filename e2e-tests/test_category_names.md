# E2E Test: Category Names Display

## Purpose
Validate that full category names (e.g., "Royalty", "Statesmen") are displayed in the UI instead of just single-letter codes (e.g., "R", "S").

## Prerequisites
- Local Supabase is running (`npm run supabase:start`)
- Knex migrations and seeds have been applied (`npm run knex:migrate && npm run knex:seed`)
- Application is running locally (`npm run dev`)

## Test Steps

### 1. Home Page — Category Section Headings
1. Navigate to `http://localhost:3000`
2. Take a screenshot of the home page
3. Verify that category section headings display full names (e.g., "Royalty" instead of "Category R")
4. At least one category heading should contain a full name from the set: Royalty, Statesmen, Philosophers, Inventors, Mathematical Scientists, Natural Scientists, Artists, Builders, Composers, Dramatists, Towns

### 2. Home Page — Table of Contents
1. On the home page, locate the Table of Contents section
2. Take a screenshot of the table of contents
3. Verify that the TOC entries display full category names (e.g., "1 Royalty" instead of "1 Category R")
4. Each TOC entry should show the index followed by the full category name

### 3. Character Detail Page — Category Display
1. Click on a character link from the home page
2. Navigate to a character detail page (e.g., `/characters/<id>`)
3. Take a screenshot of the character detail page
4. Verify that the Category field in the character infobox shows the full category name (e.g., "Royalty") instead of just the letter code (e.g., "R")

## Expected Results
- All category headings show full names when `category_name` table data is available
- Table of contents shows full category names
- Character detail pages show full category names
- If `category_name` table is empty or unavailable, the UI gracefully falls back to displaying single-letter codes
