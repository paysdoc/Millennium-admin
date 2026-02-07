# Chore: Update README and Install Command

## Chore Description
The README.md has an outdated project structure section that references `app/` instead of `src/app/`, and lists no other directories. It needs to reflect the actual architecture including the `adws/` (AI Developer Workflow Scripts) directory, the `prompts/` directory, and the `.claude/` configuration. Additionally, `.claude/commands/install.md` should be updated so that every `/install` run validates the README against the actual file structure.

## Relevant Files
Use these files to resolve the chore:

- `README.md` — The file to update with accurate project structure and architecture.
- `.claude/commands/install.md` — The install command to update so it triggers README validation on every `/install`.
- `src/app/**` — Actual Next.js App Router pages to document accurately.
- `adws/**` — AI Developer Workflow scripts (TypeScript, not Python) to document.
- `prompts/**` — Coding guidelines to document.

## Step by Step Tasks

### 1. Update the Project Structure section in README.md
- Replace the current `## Project Structure` section with an accurate tree reflecting:
  - `src/app/` — Next.js App Router directory (layout.tsx, page.tsx, globals.css, pages/, users/, settings/)
  - `adws/` — AI Developer Workflow Scripts (TypeScript): agent orchestration, git operations, GitHub API, PR creation
  - `prompts/` — Coding guidelines
  - `.claude/` — Claude Code configuration (commands, hooks, settings)
  - `.github/workflows/` — CI/CD pipeline
- Remove references to directories that don't exist (e.g., `src/components/`, `src/lib/`, `public/`).
- Keep all other README sections unchanged (Getting Started, Features, Build, Deployment Pipeline, etc.).

### 2. Update .claude/commands/install.md
- Add a step that instructs Claude to compare the README project structure against the actual file tree and update it if outdated.
- Add this as a bullet under the existing `## Run` section, e.g.: `- Compare README.md project structure to actual file structure (run git ls-files). Update the Project Structure section if it is outdated.`

### 3. Run Validation Commands
- Execute the validation commands below to confirm no regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors

## Notes
- The `adws/` scripts are TypeScript (not Python). They have their own `tsconfig.json`.
- No `src/components/`, `src/lib/`, `src/hooks/`, `src/styles/`, or `public/` directories currently exist — do not add them to the structure.
- Keep README changes minimal and focused on the Project Structure section accuracy.
