# Feature: Characters Overview Page

## Feature Description
Update the main page to display an overview of all millennium characters fetched from the Supabase `characters` table. Characters will be organized alphabetically within their respective categories, where categories are displayed in the specific order: R, S, P, I, M, N, A, B, C, D, T. The page will follow Wikipedia's clean, minimal design aesthetic with serif typography, clean borders, and a familiar article-style layout.

## User Story
As a user of the Millennium Admin interface
I want to see an organized overview of all millennium characters on the home page
So that I can quickly browse and locate characters by their category and name

## Problem Statement
The current home page displays only static placeholder content with quick links. Users cannot see the millennium characters stored in the Supabase database, making it difficult to navigate and understand what characters exist in the system.

## Solution Statement
Replace the current home page content with a dynamic overview that fetches character data from Supabase and presents it in a Wikipedia-style layout. Characters will be grouped by category (displayed in the specified order: R, S, P, I, M, N, A, B, C, D, T) and sorted alphabetically within each category. The design will feature:
- A table of contents linking to each category section
- Category sections with character listings
- Wikipedia-style typography and visual design
- Server-side data fetching for optimal performance

## Relevant Files
Use these files to implement the feature:

- `src/app/page.tsx` - The main home page that will be updated to display the characters overview
- `src/app/globals.css` - Contains existing Wikipedia-style CSS classes that should be extended for the overview layout
- `src/app/layout.tsx` - Root layout component, may need adjustments for metadata
- `package.json` - Will need to add `@supabase/supabase-js` dependency
- `.env.sample` - Contains Supabase URL configuration, documents required environment variables

### New Files
- `src/lib/supabase.ts` - Supabase client initialization and configuration
- `src/lib/characters.ts` - Functions for fetching and organizing character data
- `src/types/character.ts` - TypeScript type definitions for the Character entity
- `src/components/Header.tsx` - Reusable header component extracted from existing pages
- `src/components/Footer.tsx` - Reusable footer component extracted from existing pages
- `src/components/CategorySection.tsx` - Component for rendering a category with its characters
- `src/components/TableOfContents.tsx` - Component for rendering the category navigation

## Implementation Plan
### Phase 1: Foundation
1. Add `@supabase/supabase-js` package dependency
2. Create Supabase client utility with proper TypeScript types
3. Define the Character TypeScript interface based on the database schema
4. Extract reusable Header and Footer components from existing pages

### Phase 2: Core Implementation
1. Create data fetching functions for characters with category grouping and sorting
2. Build the CategorySection component for rendering characters within a category
3. Build the TableOfContents component for category navigation
4. Update the main page to fetch and display the characters overview

### Phase 3: Integration
1. Add Wikipedia-style CSS for the overview page layout
2. Update existing pages to use the extracted Header/Footer components
3. Ensure responsive design works across different screen sizes
4. Add loading and error states for data fetching

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Install Supabase dependency
- Run `npm install @supabase/supabase-js` to add the Supabase client library
- Verify the dependency is added to `package.json`

### Step 2: Create TypeScript types for Character
Create `src/types/character.ts`:
- Define the `Character` interface with fields: `id`, `name`, `category`, and any other fields from the database schema
- Define the `CategoryOrder` type as a tuple of the valid categories: `['R', 'S', 'P', 'I', 'M', 'N', 'A', 'B', 'C', 'D', 'T']`
- Define `CharactersByCategory` type for grouped characters

### Step 3: Create Supabase client utility
Create `src/lib/supabase.ts`:
- Initialize the Supabase client using environment variables `SUPABASE_URL` and `SUPABASE_KEY`
- Export the client for use in data fetching functions
- Use `NEXT_PUBLIC_` prefix for client-side environment variables if needed

### Step 4: Create character data fetching functions
Create `src/lib/characters.ts`:
- Implement `fetchAllCharacters()` function that queries the `characters` table from Supabase
- Implement `groupCharactersByCategory(characters: Character[])` function that:
  - Groups characters by their `category` field
  - Sorts characters alphabetically within each category
  - Returns groups in the specified category order: R, S, P, I, M, N, A, B, C, D, T
- Export both functions for use in the page component

### Step 5: Extract reusable Header component
Create `src/components/Header.tsx`:
- Extract the header JSX from `src/app/page.tsx`
- Accept optional props for active page highlighting
- Include the logo, navigation links (Home, Pages, Users, Settings)
- Use the existing Wikipedia-style CSS classes

### Step 6: Extract reusable Footer component
Create `src/components/Footer.tsx`:
- Extract the footer JSX from `src/app/page.tsx`
- Include the copyright notice with dynamic year
- Use the existing Wikipedia-style CSS classes

### Step 7: Create TableOfContents component
Create `src/components/TableOfContents.tsx`:
- Accept an array of category labels as props
- Render a Wikipedia-style table of contents box
- Each category should link to its corresponding section using anchor links
- Style using existing sidebar CSS classes or add new Wikipedia-style TOC styles

### Step 8: Create CategorySection component
Create `src/components/CategorySection.tsx`:
- Accept `category` name and `characters` array as props
- Render the category as a section header with an anchor ID
- Render characters in a clean list or grid format
- Each character name should be displayed with Wikipedia-style typography
- Add "back to top" link at the end of each section

### Step 9: Add Wikipedia-style overview CSS
Update `src/app/globals.css`:
- Add styles for `.toc` (table of contents) with Wikipedia styling
- Add styles for `.category-section` with proper heading styles
- Add styles for `.character-list` for character listings
- Add styles for `.overview-content` for the main content area
- Ensure styles match Wikipedia's clean aesthetic with serif fonts for headings

### Step 10: Update the main page component
Update `src/app/page.tsx`:
- Import the new components (Header, Footer, TableOfContents, CategorySection)
- Import the data fetching functions
- Fetch characters using server-side data fetching (`async` component)
- Group characters by category using the utility function
- Render the TableOfContents with available categories
- Render CategorySection for each category in the specified order
- Handle empty states when no characters exist
- Keep the page title as "Millennium Admin" or update to "Millennium Characters Overview"

### Step 11: Update existing pages to use shared components
Update `src/app/pages/page.tsx`, `src/app/users/page.tsx`, `src/app/settings/page.tsx`:
- Import and use the shared Header component
- Import and use the shared Footer component
- Remove duplicated header/footer JSX

### Step 12: Run validation commands
Execute the validation commands to ensure all changes work correctly with zero regressions.

## Testing Strategy
### Unit Tests
- Test `groupCharactersByCategory()` function with various character inputs
- Test that categories are ordered correctly (R, S, P, I, M, N, A, B, C, D, T)
- Test that characters are sorted alphabetically within categories
- Test handling of empty character arrays
- Test handling of characters with unknown categories

### Integration Tests
- Test that the page fetches and displays characters from Supabase
- Test that the table of contents links navigate to correct sections
- Test that the Header and Footer components render correctly across pages

### Edge Cases
- No characters in the database (empty state)
- Characters with missing or null category values
- Characters with special characters in names
- Categories with no characters (should be omitted from display)
- Very long character names (text wrapping)
- Large number of characters (performance)

## Acceptance Criteria
- [ ] Characters are fetched from the Supabase `characters` table
- [ ] Characters are grouped by category in the order: R, S, P, I, M, N, A, B, C, D, T
- [ ] Characters are sorted alphabetically within each category
- [ ] A table of contents shows all categories with anchor links
- [ ] The page follows Wikipedia's visual design aesthetic
- [ ] The Header and Footer are extracted as reusable components
- [ ] All existing pages use the shared Header and Footer components
- [ ] The page handles loading and error states gracefully
- [ ] The page is responsive and works on different screen sizes
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds with no errors
- [ ] `npm test` passes with no regressions

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- **New Dependency**: The `@supabase/supabase-js` package must be installed using `npm install @supabase/supabase-js`
- **Environment Variables**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or server-side equivalents) are set in the environment. The `.env.sample` already includes `SUPABASE_URL` and `SUPABASE_KEY`.
- **Category Order**: The specified category order (R, S, P, I, M, N, A, B, C, D, T) should be maintained even if some categories have no characters - categories without characters should simply be omitted from the display.
- **Server-Side Rendering**: Use Next.js server components for data fetching to ensure the page is SEO-friendly and loads quickly.
- **Wikipedia Design Reference**: Follow Wikipedia's design patterns including:
  - Georgia or serif fonts for article titles
  - Blue (#0645ad) for links
  - Light gray (#f8f9fa) backgrounds for navigation elements
  - Clean borders (#a7d7f9) for content areas
  - Minimal visual clutter
