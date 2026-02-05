# PR-Review: Add Storage Bucket Sync for Character Images

## PR-Review Description
The PR review comment on `.github/workflows/sync-supabase.yml` (line 1) from paysdoc requests:

> "The script should also copy the 'character images' bucket with content"

This requires extending the current sync functionality from database tables only to also include Supabase Storage bucket synchronization. The 'character images' bucket contains image files associated with characters and needs to be copied from production to staging along with the database data.

## Summary of Original Implementation Plan
The original implementation plan created a Supabase data sync system with the following key components:
- TypeScript sync script (`scripts/sync-supabase.ts`) to copy production data to staging
- Configuration file (`scripts/sync-config.ts`) defining tables to sync with PII field mappings
- PII anonymization logic for sensitive fields (names, text content)
- GitHub Action for monthly automated synchronization
- Explicit exclusion of the `users` table for privacy

The implementation was later extended to sync additional tables: `character`, `connection`, `game_players`, `games`, and `profiles` (with PII anonymization). The current implementation only handles database tables, not storage buckets.

## Relevant Files
Use these files to resolve the review:

- `scripts/sync-types.ts` - Type definitions that need new interfaces for bucket configuration and bucket sync results.
- `scripts/sync-config.ts` - Configuration file that needs to add bucket configuration with the 'character images' bucket.
- `scripts/sync-supabase.ts` - Main sync script that needs new functions for storage bucket operations (list, download, upload, delete).
- `scripts/__tests__/sync-supabase.test.ts` - Unit tests that need new tests for bucket configuration and helper functions.
- `.github/workflows/sync-supabase.yml` - GitHub Action workflow. No changes needed as it already runs `npm run sync:supabase`.

### New Files
None required - all changes will be in existing files.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add storage bucket types to sync-types.ts
- Add a new `BucketConfig` interface with:
  - `name: string` - The bucket name (e.g., 'character images')
  - `syncContent: boolean` - Whether to sync files within the bucket
- Add a new `BucketSyncResult` interface with:
  - `bucketName: string`
  - `filesProcessed: number`
  - `success: boolean`
  - `error?: string`
- Update `SyncConfig` interface to include:
  - `bucketsToSync: readonly BucketConfig[]`
- Update `SyncResult` interface to include:
  - `bucketsProcessed: readonly BucketSyncResult[]`

### Step 2: Add bucket configuration to sync-config.ts
- Add a `createBucketConfig` helper function similar to `createTableConfig`
- Add a `characterImagesBucket` configuration:
  - `name: 'character images'`
  - `syncContent: true`
- Add `bucketsToSync` array to `syncConfig` containing:
  - `characterImagesBucket`
- Export a `getBucketConfig` function to retrieve bucket config by name

### Step 3: Add storage sync functions to sync-supabase.ts
- Add a `listBucketFiles` function that:
  - Uses Supabase Storage API to list all files in a bucket
  - Handles pagination for large buckets (list returns max 1000 files at a time)
  - Returns array of file paths
- Add a `downloadFile` function that:
  - Downloads a single file from production bucket
  - Returns the file data as a Blob/Buffer
- Add a `uploadFile` function that:
  - Uploads a single file to staging bucket
  - Handles content-type preservation
- Add a `clearBucket` function that:
  - Lists all files in staging bucket
  - Deletes all files in batches
- Add a `syncBucket` function that:
  - Lists files from production bucket
  - Clears staging bucket
  - Downloads and re-uploads each file
  - Logs progress
  - Returns `BucketSyncResult`

### Step 4: Integrate bucket sync into main runSync function
- In `runSync` function, after table sync completes:
  - Loop through `syncConfig.bucketsToSync`
  - Call `syncBucket` for each bucket
  - Collect results into `bucketsProcessed` array
- Update the final result object to include `bucketsProcessed`
- Update console logging to show bucket sync progress and summary

### Step 5: Update help message with bucket information
- In `showHelp` function, add:
  - Buckets synced information: `syncConfig.bucketsToSync.map(b => b.name).join(', ')`

### Step 6: Add unit tests for bucket configuration
- In `scripts/__tests__/sync-supabase.test.ts`, add a new describe block for bucket config:
  - Test that `syncConfig.bucketsToSync` exists and is an array
  - Test that 'character images' bucket is included
  - Test that `getBucketConfig('character images')` returns the correct config
  - Test that `getBucketConfig` returns undefined for unknown buckets

### Step 7: Add unit tests for bucket sync helper functions
- Add tests for `listBucketFiles` (mocked Supabase client):
  - Returns empty array for empty bucket
  - Returns file paths for bucket with files
  - Handles pagination for large buckets
- Add tests for `clearBucket` (mocked):
  - Handles empty bucket gracefully
  - Deletes all files in batches

### Step 8: Run validation commands
- Run all validation commands to ensure the changes are correct and introduce no regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Bucket naming**: The bucket name 'character images' contains a space, which is valid in Supabase Storage. Ensure the code handles this correctly.
- **File size considerations**: Storage sync may take longer than database sync depending on the number and size of images. The script should log progress for visibility.
- **No PII in images**: Character images are public historical data (like character portraits), so no anonymization is needed for storage files.
- **Supabase Storage API**: Uses `supabase.storage.from(bucketName)` for bucket operations:
  - `.list()` to list files
  - `.download(path)` to download a file
  - `.upload(path, file)` to upload a file
  - `.remove([paths])` to delete files
- **Error handling**: Individual file failures should not stop the entire bucket sync. Log errors and continue with remaining files, then report partial success.
- **Rate limiting**: Supabase Storage API has rate limits. Consider adding small delays between operations if issues arise during large syncs.
- **Existing bucket**: The staging bucket 'character images' must already exist in the staging Supabase project. The script syncs content, not bucket creation.
