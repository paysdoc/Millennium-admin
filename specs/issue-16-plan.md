# Chore: Change Homepage Welcome Text

## Chore Description
Update the welcome text on the homepage to better describe the actual functionality of the Millennium Admin application. The current generic text about "admin interface built with Next.js in a Wikipedia-style design" should be replaced with a user-friendly description of what users can do with the application.

## User Story
As a **Millennium Admin user**
I want to **see a helpful description of what the application does when I visit the homepage**
So that **I understand the available features for managing millennium characters and their connections**

## Problem Statement
The current homepage welcome text ("This is your admin interface built with Next.js in a Wikipedia-style design.") is generic and doesn't inform users about the actual capabilities of the application. Users landing on the homepage have no immediate understanding of what they can accomplish.

## Solution Statement
Replace the generic welcome text with a descriptive message that explains the key features:
- Adding, editing, and deleting millennium characters
- Updating character images
- Selecting which area of an image to use
- Creating, editing, and deleting connections between characters

## Relevant Files
Use these files to resolve the chore:

### Existing Files (to modify)
- `src/app/page.tsx` — The homepage component containing the welcome text to be changed (lines 35-38)

### New Files
- None required

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update the Welcome Text
- Open `src/app/page.tsx`
- Locate the `<p>` element containing the text "This is your admin interface built with Next.js in a Wikipedia-style design." (lines 35-38)
- Replace the text with: "Here you can add, edit and delete millennium characters, update character images, select which area of an image to use, and create, edit and delete connections between characters"

### Step 2: Run Validation Commands
- Execute all validation commands to verify the change works correctly with zero regressions

## Testing Strategy

### Manual Testing
- Start the development server with `npm run dev`
- Navigate to the homepage (http://localhost:3000)
- Verify the new text is displayed correctly

### Automated Tests
- Run linter to ensure code quality
- Run build to ensure no build errors
- Run any existing tests to verify no regressions

## Acceptance Criteria
- [ ] The homepage displays the new text: "Here you can add, edit and delete millennium characters, update character images, select which area of an image to use, and create, edit and delete connections between characters"
- [ ] The old text is no longer displayed
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] Application renders correctly in the browser

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the application to verify no build errors
- `npm run dev` — Start dev server to manually verify the text change displays correctly

## Notes
- This is a simple text-only change with no structural modifications to the component
- The text location remains in the same `<p>` element following the `<h1>` page title
- No styling changes are required
- The change is self-contained and does not affect any other components or files
