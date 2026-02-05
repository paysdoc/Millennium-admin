-- =============================================================================
-- Migration Script: Update image_link paths in character table
-- =============================================================================
--
-- Description:
--   This script migrates the `image_link` column in the `character` table from
--   the old path format to the new format by removing the 'data/' prefix.
--
-- Transformation:
--   Before: 'data/character_images/john_doe.jpg'
--   After:  'character_images/john_doe.jpg'
--
-- Instructions:
--   1. Open the Supabase SQL Editor dashboard
--   2. Create a backup of your data before running this script
--   3. Run the SELECT query first to preview affected records
--   4. If the preview looks correct, run the UPDATE statement
--
-- WARNING:
--   Always backup your data before running migration scripts!
--   You can create a backup by exporting the character table data.
--
-- Notes:
--   - This script is idempotent: running it multiple times is safe
--   - Records with NULL image_link values will not be affected
--   - Records already in the new format will not be affected
--
-- =============================================================================

-- Step 1: Preview records that will be updated
-- Run this query first to see which records will be affected
SELECT
    id,
    name,
    image_link AS old_image_link,
    REPLACE(image_link, 'data/character_images/', 'character_images/') AS new_image_link
FROM character
WHERE image_link LIKE 'data/character_images/%';

-- Step 2: Update the image_link paths
-- Run this after verifying the preview looks correct
UPDATE character
SET image_link = REPLACE(image_link, 'data/character_images/', 'character_images/')
WHERE image_link LIKE 'data/character_images/%';

-- Step 3: Verify the migration was successful
-- Run this to confirm no records have the old format
SELECT COUNT(*) AS remaining_old_format_count
FROM character
WHERE image_link LIKE 'data/character_images/%';
