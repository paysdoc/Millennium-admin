# PR-Review: Add email anonymization to profiles table

## PR-Review Description
The PR review comment on `scripts/sync-config.ts` (line 64) from paysdoc requests:

> "profiles table contains an email address. That also needs to be anonymized"

The profiles table currently has PII anonymization configured for `username`, `display_name`, `full_name`, and `bio` fields, but is missing the `email` field. Email addresses are sensitive PII that must be anonymized when syncing production data to staging to prevent exposure of user contact information.

## Summary of Original Implementation Plan
The original implementation plan created a Supabase data sync system with the following key components:
- TypeScript sync script (`scripts/sync-supabase.ts`) to copy production data to staging
- Configuration file (`scripts/sync-config.ts`) defining tables to sync with PII field mappings
- PII anonymization logic for sensitive fields (names, text content)
- Storage bucket sync for character images
- GitHub Action for monthly automated synchronization
- Explicit exclusion of the `users` table for privacy

The profiles table was configured with anonymization for username, display_name, full_name (using 'name' rule) and bio (using 'text' rule), but email was inadvertently omitted.

## Relevant Files
Use these files to resolve the review:

- `scripts/sync-types.ts` - Type definitions that need a new 'email' anonymization rule added to the `AnonymizationRule` type.
- `scripts/sync-supabase.ts` - Main sync script that needs a new `anonymizeEmail` function and updated `anonymizeField` function to handle the email rule.
- `scripts/sync-config.ts` - Configuration file that needs to add `['email', 'email']` to the profiles table PII fields.
- `scripts/__tests__/sync-supabase.test.ts` - Unit tests that need new tests for email anonymization.

### New Files
None required - all changes will be in existing files.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add 'email' to AnonymizationRule type in sync-types.ts
- Update the `AnonymizationRule` type union on line 8 to include 'email':
  ```typescript
  export type AnonymizationRule = 'name' | 'text' | 'email' | 'none'
  ```

### Step 2: Add anonymizeEmail function to sync-supabase.ts
- Add a new constant `EMAIL_DOMAINS` array with common test domains:
  ```typescript
  const EMAIL_DOMAINS = [
    'example.com', 'test.com', 'staging.local', 'demo.org', 'sample.net',
  ] as const
  ```
- Add a new `anonymizeEmail` function after `anonymizeText` that:
  - Returns null/empty for null or empty input (preserve these values)
  - Uses the deterministic `hashString` function to ensure same email always maps to same fake email
  - Generates a fake email in format: `user{hash}@{domain}` where domain is selected from EMAIL_DOMAINS
  - Example: `user123456@example.com`
- Export the function for testing

### Step 3: Update anonymizeField to handle 'email' rule
- Add a new case in the `anonymizeField` switch statement (around line 83):
  ```typescript
  case 'email':
    return typeof value === 'string' ? anonymizeEmail(value) : value
  ```

### Step 4: Add email to profiles table PII fields in sync-config.ts
- Update the `profilesTable` configuration (line 60-65) to include email:
  ```typescript
  const profilesTable = createTableConfig('profiles', [
    ['username', 'name'],
    ['display_name', 'name'],
    ['full_name', 'name'],
    ['bio', 'text'],
    ['email', 'email'],
  ])
  ```

### Step 5: Add unit tests for email anonymization
- In `scripts/__tests__/sync-supabase.test.ts`:
  - Add `anonymizeEmail` to the imports from '../sync-supabase'
  - Add a new describe block for `anonymizeEmail`:
    - Test that `anonymizeEmail` returns null for null input
    - Test that `anonymizeEmail` returns empty string for empty input
    - Test that `anonymizeEmail` returns whitespace-only string unchanged
    - Test that `anonymizeEmail` returns a valid email format (contains @)
    - Test that `anonymizeEmail` is deterministic (same input produces same output)
    - Test that different emails produce different anonymized outputs
  - Update `describe('anonymizeField')` tests:
    - Add test that `anonymizeField` handles the 'email' rule correctly
    - Add test that returns non-string values unchanged for email rule
    - Update the null check test (line 128-131) to include: `expect(anonymizeField(null, 'email')).toBeNull()`
  - Update the test `'has correct PII field anonymization rules for profiles table'` (line 319-329):
    - Add assertion: `expect(profilesConfig!.piiFields.get('email')).toBe('email')`

### Step 6: Run validation commands
- Run all validation commands to ensure the changes are correct and introduce no regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Deterministic anonymization**: The email anonymization uses the same `hashString` function as name/text anonymization to ensure referential integrity - the same email always produces the same fake email.
- **Test domains**: Using domains like `example.com` follows RFC 2606 which reserves these domains for documentation and testing purposes.
- **Email format**: The anonymized email should be a valid email format to avoid downstream issues if the staging environment validates email formats.
- **No @ extraction**: Unlike some email anonymization approaches, we don't preserve the original domain or username structure - we generate a completely new fake email to prevent any information leakage.
