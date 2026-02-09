# Bug: Images are being retrieved using an incorrect URL

## Bug Description
Character images on the character detail page fail to load because the `image_link` value from the database (a relative storage path like `character_images/filename.jpg`) is being used directly as the `src` attribute of the Next.js `Image` component. The browser cannot resolve this relative path and the image fails to load (404 error or broken image).

**Expected behavior:** Images load correctly using the full Supabase storage URL in the format `<SUPABASE_URL>/storage/v1/object/public/<image_link>`.

**Actual behavior:** The raw `image_link` value (e.g., `character_images/portrait.jpg`) is passed directly to the `Image` component `src` prop, resulting in broken images.

## Problem Statement
The `src/lib/supabase.ts` module is missing a `getSupabaseStorageUrl()` utility function that constructs full Supabase storage URLs from relative storage paths. Without this function, the `CharacterDetails` component receives raw storage paths instead of fully-qualified URLs, causing images to fail to load.

## Solution Statement
1. Add a `getSupabaseStorageUrl()` pure function to `src/lib/supabase.ts` that constructs the full Supabase storage URL from a relative path.
2. Apply the URL transformation in the data-fetching layer (`src/lib/characters.ts`) so that all consumers of character data receive ready-to-use image URLs.

This approach keeps URL construction at the server-side data layer (where `SUPABASE_URL` env var is available) and keeps components free of environment-specific logic.

## Steps to Reproduce
1. Start the development server with `npm run dev`.
2. Navigate to the home page.
3. Click on any character that has an `image_link` in the database.
4. Observe that the character image fails to load (broken image or 404).
5. Inspect the `<img>` element in browser DevTools and note that the `src` is a relative path like `character_images/filename.jpg` instead of a full URL.

## Root Cause Analysis
The `CharacterDetails` component (`src/components/CharacterDetails.tsx`, line 16) uses `character.image_link` directly as the `Image` `src`. The `image_link` column in the `character` database table stores relative storage paths (e.g., `character_images/portrait.jpg`), not full URLs. There is no utility function to construct the full Supabase storage URL (`<SUPABASE_URL>/storage/v1/object/public/<path>`) and no transformation is applied anywhere in the data pipeline before the value reaches the component.

## Relevant Files
Use these files to fix the bug:

- **`src/lib/supabase.ts`** — The Supabase client module. Needs the new `getSupabaseStorageUrl()` function added here since it's the natural home for Supabase-related utilities and has access to `SUPABASE_URL`.
- **`src/lib/characters.ts`** — The character data-fetching module. Needs to apply the URL transformation to `image_link` after mapping database rows to `Character` objects, so all consumers receive fully-qualified image URLs.
- **`src/components/CharacterDetails.tsx`** — The component that renders character images. No changes needed (it will receive a correct URL from the data layer), but must be verified.
- **`src/types/character.ts`** — Defines the `Character` interface and `mapCharacterRowToCharacter`. No changes needed; the type already supports `string | null` for `image_link`.
- **`src/__tests__/supabase.test.ts`** — Existing tests for `supabase.ts`. Needs new tests for `getSupabaseStorageUrl()`.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `getSupabaseStorageUrl` function to `src/lib/supabase.ts`
- Add a new exported function `getSupabaseStorageUrl(path: string | null): string | null` after the existing `getSupabaseClient` function.
- The function should:
  - Return `null` if the input `path` is `null` or empty.
  - Return the `path` as-is if it already starts with `http://` or `https://` (already a full URL).
  - Read `SUPABASE_URL` from `process.env`.
  - Return `null` if `SUPABASE_URL` is not set.
  - Construct and return the full URL: `` `${supabaseUrl}/storage/v1/object/public/${path}` ``.

### Step 2: Apply URL transformation in `src/lib/characters.ts`
- Import `getSupabaseStorageUrl` from `./supabase`.
- In `fetchAllCharacters()`, after mapping rows to `Character` objects with `mapCharacterRowToCharacter`, transform each character's `image_link` using `getSupabaseStorageUrl`.
- In `fetchCharacterById()`, after mapping the single row to a `Character` object, transform its `image_link` using `getSupabaseStorageUrl`.
- Use a concise pattern: spread the mapped character and override `image_link` with the result of `getSupabaseStorageUrl(character.image_link)`.

### Step 3: Add unit tests for `getSupabaseStorageUrl` in `src/__tests__/supabase.test.ts`
- Add a new `describe('getSupabaseStorageUrl', ...)` block to the existing test file.
- Test cases:
  - Returns `null` when path is `null`.
  - Returns `null` when `SUPABASE_URL` is not set.
  - Returns the correct full URL when given a relative path (e.g., `character_images/photo.jpg` → `https://test.supabase.co/storage/v1/object/public/character_images/photo.jpg`).
  - Returns the path as-is when it already starts with `https://`.
  - Returns the path as-is when it already starts with `http://`.
- Use `vi.resetModules()` and dynamic `import()` pattern consistent with existing tests in the file to handle `process.env` changes.

### Step 4: Run validation commands
- Run `npm run lint`, `npm run build`, and `npm test` to validate the fix with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `SUPABASE_URL` environment variable does NOT have the `NEXT_PUBLIC_` prefix, so it is only available server-side. This is correct since `characters.ts` runs on the server (called from server components). The URL transformation must happen at the data-fetching layer, not in client components.
- The `getSupabaseStorageUrl` function should be a pure function (no side effects beyond reading `process.env`) per the functional programming guidelines.
- The function handles the case where `image_link` is already a full URL to be defensive, in case the database value format ever changes.
