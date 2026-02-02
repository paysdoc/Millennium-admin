# PR-Review: Fix Build Error for Missing Supabase Environment Variables

## PR-Review Description
The PR #42 implementing the characters overview page fails to build in CI/CD environments where Supabase environment variables are not configured. The error occurs during `npm run build` when Next.js attempts to pre-render server components and encounters a thrown error from `src/lib/supabase.ts` at module load time.

The current implementation throws an error immediately when the supabase module is imported if `SUPABASE_URL` or `SUPABASE_KEY` environment variables are missing:

```typescript
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}
```

This error is thrown at module load time, not at runtime when the client is used, which prevents the build from completing in environments without these variables configured.

## Summary of Original Implementation Plan
The original plan (issue #1) implemented a Characters Overview Page that:
- Fetches character data from Supabase `characters` table
- Groups characters by category in a specific order (R, S, P, I, M, N, A, B, C, D, T)
- Sorts characters alphabetically within each category
- Displays them in a Wikipedia-style layout with table of contents
- Extracts reusable Header and Footer components
- Uses server-side data fetching in Next.js server components

The implementation created `src/lib/supabase.ts` for client initialization and `src/lib/characters.ts` for data fetching, but the error handling for missing environment variables was not designed to be build-time safe.

## Relevant Files
Use these files to resolve the review:

- `src/lib/supabase.ts` - Supabase client initialization that throws at module load time; needs to be refactored to use lazy initialization
- `src/lib/characters.ts` - Character data fetching functions that import supabase; may need updates to handle unavailable client gracefully

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Refactor Supabase client to use lazy initialization
Update `src/lib/supabase.ts`:
- Remove the immediate error throw at module load time
- Create a `getSupabaseClient()` function that lazily initializes the client
- The function should return `null` if environment variables are missing (allowing build to succeed)
- Throw a descriptive error only when `getSupabaseClient()` is called and variables are missing
- Alternatively, use a getter pattern or lazy initialization that defers the check to runtime

Example approach:
```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}
```

### Step 2: Update character data fetching to use lazy client
Update `src/lib/characters.ts`:
- Replace the direct `supabase` import with the new `getSupabaseClient()` function
- Call `getSupabaseClient()` inside `fetchAllCharacters()` instead of at import time
- This ensures the error is thrown at data fetch time, not at build time

Example:
```typescript
import { getSupabaseClient } from './supabase'
// ... rest of imports

export async function fetchAllCharacters(): Promise<Character[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, category')
  // ... rest of implementation
}
```

### Step 3: Run validation commands
Execute the validation commands to ensure the build succeeds in environments without Supabase credentials and all tests pass:
- `npm run lint` - Verify no linting errors
- `npm run build` - Verify the build succeeds (this was the failing command)
- `npm test` - Verify all tests pass with zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors (this must pass without Supabase env vars)
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Root Cause**: The error is thrown at module import time, which happens during Next.js static analysis/pre-rendering during `npm run build`. This prevents the build from completing even though the actual page would handle the error gracefully at runtime.
- **Lazy Initialization Pattern**: By deferring the client creation and validation to a function call, the module can be safely imported during build time. The error will only be thrown when data is actually fetched, which doesn't happen during the build's static analysis phase.
- **Build vs Runtime**: Next.js server components are evaluated during build to check for errors, but actual data fetching can be deferred. The existing error handling in `page.tsx` (try/catch around `fetchAllCharacters()`) will properly catch runtime errors and display the error state.
- **CI/CD Compatibility**: This fix ensures the build succeeds in CI/CD environments that may not have production secrets configured, while still failing gracefully with a clear error message when the page is rendered without valid Supabase configuration.
