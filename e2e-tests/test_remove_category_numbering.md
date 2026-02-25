# E2E Test: Remove Category Numbering

## Purpose
Validate that the Table of Contents on the home page no longer shows numeric prefixes before category names (e.g., "Royalty" instead of "1 Royalty").

## Prerequisites
- Local Supabase is running (`npm run supabase:start`)
- Supabase database has been reset with migrations and seeds (`npm run supabase:reset`)
- Application is running locally (`npm run dev`)

## Test Steps

### 1. Home Page — Table of Contents Without Numbering
1. Navigate to `http://localhost:3000`
2. Take a screenshot of the Table of Contents
3. Verify that TOC entries display category names without numeric prefixes (e.g., "Royalty" instead of "1 Royalty")
4. Verify that no TOC entry text begins with a digit followed by a space

### 2. TOC Link Navigation Still Works
1. On the home page, click on a TOC link (e.g., "Royalty")
2. Verify that the page scrolls to the corresponding category section
3. Verify that the category section heading matches the TOC link text

## Expected Results
- TOC entries display only the category name without any numeric prefix
- No TOC entry text matches the pattern `^\d+ .+` (digit followed by space followed by text)
- Clicking a TOC link scrolls to the correct category section
- The `<ol>` list structure is preserved in the DOM
