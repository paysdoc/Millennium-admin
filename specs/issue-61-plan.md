# PR-Review: Fix image retrieval from Supabase Storage bucket (Revision 2)

## PR-Review Description
The PR #63 implemented adding images to the character details page, but images are not being displayed with 404 errors. The original fix suggested using a `SUPABASE_BUCKET_NAME` environment variable, but the reviewer clarified that this approach is incorrect.

**Key insight from PR review comment:** The bucket name is already embedded in the `image_link` path stored in the database. The path format is `{bucket_name}/{filename}` (e.g., `character_images/image.jpg`). Therefore, we don't need a separate environment variable for the bucket name.

The correct fix is to construct the full Supabase Storage URL by prepending `{SUPABASE_URL}/storage/v1/object/public/` to the existing `image_link` value, which already contains the bucket name as part of the path.

## Summary of Original Implementation Plan
The original implementation plan (issue-61-plan.md revision 1) detailed:
- Adding a `getSupabaseStorageUrl` function using a `SUPABASE_BUCKET_NAME` environment variable
- Updating `.env.sample` with the new `SUPABASE_BUCKET_NAME` variable
- Updating the character detail page to use the utility function

**Why it failed:** The approach assumed the bucket name needed to be configured separately, but the bucket name is already part of the `image_link` path in the database.

## Relevant Files
Use these files to resolve the review:

- `src/lib/supabase.ts` - Supabase client configuration; add a utility function to construct storage URLs using only `SUPABASE_URL` (no bucket name needed)
- `src/components/CharacterDetails.tsx` - Character details component; update to transform `image_link` to a full storage URL before passing to the Image component
- `e2e-tests/test_character_detail.md` - E2E test specification; add verification for image display

### New Files
None required - all changes are modifications to existing files.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add Storage URL Utility Function
- Edit `src/lib/supabase.ts`
- Add a new exported function `getSupabaseStorageUrl(path: string | null): string | null`
- The function should:
  - Return `null` if path is null or empty
  - If path already starts with `http://` or `https://`, return it unchanged (backwards compatibility)
  - Otherwise, construct the full URL: `${SUPABASE_URL}/storage/v1/object/public/${path}`
  - Use the existing `SUPABASE_URL` environment variable (already available in the file)
- The `path` parameter already includes the bucket name (e.g., `character_images/filename.jpg`)

### Step 2: Update CharacterDetails Component
- Edit `src/components/CharacterDetails.tsx`
- Import `getSupabaseStorageUrl` from `@/lib/supabase`
- Before using `character.image_link` in the Image component, transform it using `getSupabaseStorageUrl(character.image_link)`
- Store the result in a variable (e.g., `const imageUrl = getSupabaseStorageUrl(character.image_link)`)
- Update the conditional render to use `imageUrl` instead of `character.image_link`
- Update the Image component `src` prop to use `imageUrl`

### Step 3: Update E2E Test Specification
- Edit `e2e-tests/test_character_detail.md`
- Add a step to verify that if the character has an image, it is displayed without 404 errors
- Add verification that the image `src` attribute contains the Supabase storage URL pattern (`/storage/v1/object/public/`)
- Update success criteria to include "Character images load successfully (no 404 errors)"

### Step 4: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the review is complete with zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **No environment variable changes needed**: The `SUPABASE_URL` environment variable is already configured and available. No new environment variables are required.
- **URL construction format**: `{SUPABASE_URL}/storage/v1/object/public/{image_link}` where `image_link` already includes the bucket name
- **Example**: If `SUPABASE_URL=https://gownillwfbtrbnkrvrxi.supabase.co` and `image_link=character_images/photo.jpg`, the resulting URL would be `https://gownillwfbtrbnkrvrxi.supabase.co/storage/v1/object/public/character_images/photo.jpg`
- **Backwards compatibility**: The utility function handles the case where `image_link` might already be a full URL (starts with `http`) by returning it unchanged
- The `unoptimized` prop on the Next.js Image component is already set, which is correct for external Supabase Storage URLs
