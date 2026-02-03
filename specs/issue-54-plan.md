# Feature: Character Detail Page

## Feature Description
Add a detail page for each character that displays all character fields in one section and all their connections in another section. The connections section shows relationships where the character is either the first or second ID in the connection table. Additionally, update the overview page to link each character name to their detail page, enabling easy navigation.

## User Story
As a user
I want to view detailed information about each character including their connections
So that I can understand a character's full profile and relationships at a glance

## Problem Statement
Currently, the application only displays character names in a categorized list on the overview page. Users cannot view detailed character information (biography, dates, links) or see the connections between characters. This limits the usefulness of the application for exploring character relationships and detailed profiles.

## Solution Statement
Create a dynamic detail page route at `/characters/[id]` that fetches and displays a single character's complete information. The page will have two main sections:
1. **Character Details Section**: Displays all character fields (name, first names, birth/death dates, biography, category, external link, image)
2. **Connections Section**: Displays a table of all connections where the character is involved (either as char1 or char2), showing the connection value, description (why), shorthand (why_short), and active status

The overview page will be updated so each character name becomes a clickable link to their detail page.

## Relevant Files
Use these files to implement the feature:

- `src/app/page.tsx` - Home page displaying character overview; no changes needed as CategorySection handles the character list
- `src/components/CategorySection.tsx` - Component displaying character lists; needs to be updated to wrap character names in links
- `src/lib/characters.ts` - Character data fetching functions; needs a new function to fetch a single character by ID
- `src/lib/connections.ts` - Connection data fetching functions; already has `fetchConnectionsByCharacter` function that can be used
- `src/types/character.ts` - Character type definitions; no changes needed
- `src/types/connection.ts` - Connection type definitions; no changes needed
- `src/app/globals.css` - Global styles; needs new styles for the detail page layout

### New Files
- `src/app/characters/[id]/page.tsx` - New dynamic route page for character detail view
- `src/components/CharacterDetails.tsx` - New component to display character information section
- `src/components/ConnectionsTable.tsx` - New component to display connections in a table format
- `.claude/commands/e2e-examples/example_test_character_detail.md` - E2E test specification for the character detail page

## Implementation Plan
### Phase 1: Foundation
- Create the E2E test specification to define expected behavior
- Add function to fetch a single character by ID from the database
- Extend Character type if needed for additional display requirements

### Phase 2: Core Implementation
- Create the ConnectionsTable component to display character connections
- Create the CharacterDetails component to display character information
- Create the dynamic route page at `src/app/characters/[id]/page.tsx`
- Add Wikipedia-style CSS for the detail page layout

### Phase 3: Integration
- Update CategorySection component to link character names to detail pages
- Test navigation flow from overview to detail pages
- Ensure responsive design works on mobile devices

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create E2E Test Specification
- Create `.claude/commands/e2e-examples/example_test_character_detail.md`
- Define test steps to:
  - Navigate to the home page
  - Click on a character name link
  - Verify navigation to the detail page
  - Verify character details section is displayed
  - Verify connections table is displayed
  - Verify back navigation works
- Include screenshot steps for verification

### Step 2: Add fetchCharacterById Function
- Add `fetchCharacterById(id: string): Promise<Character | null>` function to `src/lib/characters.ts`
- Query the Supabase `character` table by ID
- Map the database row to the Character interface
- Handle errors consistently with existing functions
- Return null if character not found

### Step 3: Create ConnectionsTable Component
- Create `src/components/ConnectionsTable.tsx`
- Accept props: `connections: Connection[]`, `characterId: string`, `allCharacters: Character[]`
- Display a Wikipedia-style table with columns:
  - Connected Character (show name of the other character in the connection)
  - Value (connection value)
  - Description (why)
  - Shorthand (why_short)
  - Active (yes/no)
- Handle empty connections state gracefully
- Keep component under 150 lines per coding guidelines

### Step 4: Create CharacterDetails Component
- Create `src/components/CharacterDetails.tsx`
- Accept props: `character: Character`
- Display all character fields in a Wikipedia-style infobox layout:
  - Name (as heading)
  - First Names
  - Birth Date
  - Death Date
  - Category
  - Biography
  - External Link (as clickable link)
  - Image (if image_link exists)
- Handle null/empty field values gracefully
- Keep component under 150 lines per coding guidelines

### Step 5: Create Character Detail Page
- Create `src/app/characters/[id]/page.tsx`
- Use Next.js App Router dynamic route with `[id]` parameter
- Fetch character by ID using the new function
- Fetch connections using existing `fetchConnectionsByCharacter` function
- Fetch all characters for name resolution in connections table
- Handle not found case with a friendly message
- Use consistent layout with Header and Footer
- Display CharacterDetails and ConnectionsTable components
- Add "Back to Overview" link

### Step 6: Add Detail Page Styles
- Add CSS styles to `src/app/globals.css` for:
  - Character detail layout (`.character-detail`)
  - Wikipedia-style infobox (`.infobox`)
  - Infobox rows (`.infobox-row`, `.infobox-label`, `.infobox-value`)
  - Section headings for character and connections
  - Connections table styling (reuse existing `.table` classes)
  - Active/inactive status indicators
  - Responsive adjustments for mobile

### Step 7: Update CategorySection with Character Links
- Modify `src/components/CategorySection.tsx`
- Import `Link` from `next/link`
- Wrap each character name in a `<Link>` component
- Link href should be `/characters/{character.id}`
- Maintain existing styling with Wikipedia-style link colors

### Step 8: Run Validation Commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the feature works with zero regressions

## Testing Strategy
### Unit Tests
- Test `fetchCharacterById` function returns correct character
- Test `fetchCharacterById` function returns null for non-existent ID
- Test `fetchCharacterById` handles database errors gracefully

### Integration Tests
- Test character detail page renders with valid character ID
- Test character detail page shows not found message for invalid ID
- Test connections table displays correct related characters
- Test navigation from overview to detail page works

### Edge Cases
- Character with no connections (empty connections table)
- Character with connections where they are char1_id
- Character with connections where they are char2_id
- Character with all null optional fields (dates, biography, links)
- Invalid/non-existent character ID
- Character with inactive connections (display appropriately)

## Acceptance Criteria
- [ ] Character detail page is accessible at `/characters/[id]`
- [ ] Detail page displays all character fields (name, first_names, birth_date, death_date, biography, category, link, image_link)
- [ ] Detail page displays connections table with value, why, why_short, and active columns
- [ ] Connections show the name of the other character (not just ID)
- [ ] Connections are fetched where character is either char1_id or char2_id
- [ ] Each character name on the overview page links to its detail page
- [ ] Not found state is handled gracefully for invalid character IDs
- [ ] Page follows Wikipedia-style design consistent with existing pages
- [ ] Page is responsive on mobile devices
- [ ] All validation commands pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- The `fetchConnectionsByCharacter` function already exists in `src/lib/connections.ts` and correctly filters connections where the character is either char1_id or char2_id
- The Connection type already includes all required fields: id, char1_id, char2_id, value, why, why_short, active
- Consider using Next.js `generateStaticParams` for static generation of known character pages if needed for performance
- The infobox styling should follow Wikipedia conventions for a consistent user experience
- Future enhancement: Add navigation between characters directly from the connections table (clicking connected character name)
