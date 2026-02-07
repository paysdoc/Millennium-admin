# PR-Review: Merge default branch and resolve conflicts

## PR-Review Description
PR #68 (`feature/issue-62-character-information-should-be-editable`) needs to merge the default branch (`develop`) back in and resolve any resulting conflicts. Since this branch was last synced with develop, PR #63 (feature/issue-61-add-images-to-the-details-page) was merged into develop, introducing image display functionality including a `CharacterImage` component, a `getSupabaseStorageUrl` utility function, and a two-column layout for character detail pages. The merge produces one confirmed conflict in `src/app/characters/[id]/page.tsx` where both branches modified the character detail section — develop added a two-column layout with `CharacterImage`, while this feature branch replaced `CharacterDetails` with `EditableCharacterDetails`. Additionally, `EditableCharacterDetails` (a client component) uses `character.image_link` directly, but develop's `getSupabaseStorageUrl` is needed to construct proper full URLs from storage paths. The resolved merge must combine both features: editable character fields and proper image URL handling.

## Summary of Original Implementation Plan
The original implementation plan for issue #62 (found in `specs/issue-62-plan.md`) created:
1. An `EditableCharacterDetails` client component with inline-editable fields in a Wikipedia-style infobox
2. An `EditableField` reusable component for individual field editing (text, select, textarea)
3. An API route at `/api/characters/[id]/route.ts` to handle PATCH requests for character updates
4. An `updateCharacter` function in `src/lib/characters.ts` for database updates using the Supabase service client
5. A `getSupabaseServiceClient` function in `src/lib/supabase.ts` for write operations that bypass RLS
6. Wikipedia-style CSS for edit mode (editable fields, infobox actions, responsive styles)

## Relevant Files
Use these files to resolve the review:

- `src/app/characters/[id]/page.tsx` — **CONFLICT**: Both branches modified the character detail section. Develop added `CharacterImage` + `getSupabaseStorageUrl` imports and a two-column layout. Feature branch replaced `CharacterDetails` with `EditableCharacterDetails`. Must resolve conflict to combine both features.
- `src/components/EditableCharacterDetails.tsx` — Client component that uses `character.image_link` directly for image display. Needs to accept a resolved `imageUrl` prop since it cannot call `getSupabaseStorageUrl` (which uses server-side env vars) from a client component.
- `src/components/CharacterDetails.tsx` — Develop updated this to use `getSupabaseStorageUrl`. The merge will bring in this updated version.
- `src/components/CharacterImage.tsx` — New component from develop for large standalone image display. Will be added by the merge.
- `src/lib/supabase.ts` — Auto-merges successfully. Will contain both `getSupabaseStorageUrl` (from develop) and `getSupabaseServiceClient` (from feature branch).
- `src/app/globals.css` — Auto-merges successfully. Will contain both two-column image layout CSS (from develop) and editable field CSS (from feature branch).

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Merge origin/develop into the feature branch
- Run `git fetch origin develop` to ensure latest develop is fetched
- Run `git merge origin/develop` to merge develop into the feature branch
- This will produce a conflict in `src/app/characters/[id]/page.tsx` and auto-merge `src/lib/supabase.ts` and `src/app/globals.css`
- Do NOT abort the merge — proceed to resolve the conflict

### Step 2: Resolve conflict in `src/app/characters/[id]/page.tsx`
- The conflict is between develop's two-column layout with `CharacterDetails` + `CharacterImage` and the feature branch's `EditableCharacterDetails`
- Resolve the file to combine both features. The final version should:
  - Import `EditableCharacterDetails` (from feature branch, NOT `CharacterDetails`)
  - Import `CharacterImage` (from develop)
  - Import `getSupabaseStorageUrl` (from develop)
  - Remove the import for `CharacterDetails` (replaced by `EditableCharacterDetails`)
  - Keep all other shared imports (`Link`, `Header`, `Footer`, `ConnectionsTable`, `fetchCharacterById`, `fetchAllCharacters`, `fetchConnectionsByCharacter`)
  - Use the two-column layout from develop, but with `EditableCharacterDetails` in the left column instead of `CharacterDetails`:
    ```tsx
    <div className="character-info-section">
      <div className="character-info-left">
        <EditableCharacterDetails character={character} imageUrl={getSupabaseStorageUrl(character.image_link)} />
      </div>
      <div className="character-info-right">
        <CharacterImage
          imageUrl={getSupabaseStorageUrl(character.image_link)}
          characterName={character.name}
        />
      </div>
    </div>
    ```
- Stage the resolved file with `git add src/app/characters/[id]/page.tsx`

### Step 3: Update `EditableCharacterDetails` to accept `imageUrl` prop
- Since `EditableCharacterDetails` is a `'use client'` component, it cannot call `getSupabaseStorageUrl` (which accesses `process.env.SUPABASE_URL`, a server-side env var)
- Add an optional `imageUrl` prop of type `string | null` to the `EditableCharacterDetailsProps` interface
- Update the image rendering to use `imageUrl` prop instead of `character.image_link`:
  - Change `{character.image_link && (` to `{imageUrl && (`
  - Change `src={character.image_link}` to `src={imageUrl}`
- This ensures proper Supabase Storage URL construction while respecting the server/client component boundary

### Step 4: Verify auto-merged files are correct
- Read `src/lib/supabase.ts` and verify it contains both:
  - `getSupabaseStorageUrl` function (from develop)
  - `getSupabaseServiceClient` function (from feature branch)
  - `getSupabaseClient` function (shared)
- Read `src/app/globals.css` and verify it contains both:
  - Two-column layout CSS (`.character-info-section`, `.character-info-left`, `.character-info-right`, `.character-image-container`, `.character-detail-image`) from develop
  - Editable field CSS (`.editable-field`, `.infobox-actions`, `.infobox-buttons`, `.infobox-error`) from feature branch
  - Responsive breakpoints from both branches
- Read `src/components/CharacterDetails.tsx` and verify it uses `getSupabaseStorageUrl` (from develop)
- Verify `src/components/CharacterImage.tsx` exists (from develop)
- If any auto-merged file is incorrect, fix it manually

### Step 5: Complete the merge commit
- Run `git commit --no-edit` to complete the merge commit with the default merge message
- Verify the merge was successful with `git log --oneline -5`

### Step 6: Run Validation Commands
- Run `npm run lint` to verify no linting errors
- Run `npm run build` to verify the application builds successfully
- Run `npm test` to ensure all tests pass
- If any validation fails, fix the issues and create a new commit

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The merge produces exactly one conflict: `src/app/characters/[id]/page.tsx`. The other modified files (`supabase.ts`, `globals.css`) auto-merge cleanly.
- The `getSupabaseStorageUrl` function from develop uses `process.env.SUPABASE_URL` (server-side only). Since `EditableCharacterDetails` is a client component (`'use client'`), the URL must be resolved in the server page component and passed as a prop.
- The two-column layout from develop (PR #63) is an approved feature that should be preserved in the merge. The left column gets `EditableCharacterDetails` (replacing `CharacterDetails`), the right column keeps `CharacterImage`.
- `CharacterDetails.tsx` still exists alongside `EditableCharacterDetails.tsx` — it's used elsewhere (or may be used for read-only views). The merge brings in the develop version which uses `getSupabaseStorageUrl`.
- The `globals.css` auto-merge preserves both the image layout CSS and the editable field CSS. No manual fix needed since the additions are in different sections of the file.
