# Revision Plan: Rewrite trigger_webhook.py in TypeScript

## PR Review Comment
> trigger_webhook.py should be written in typescript, not python. The bash command should be 'npx tsx adws/trigger_webhook.ts'

## Changes Required

### 1. Create `adws/trigger_webhook.ts` (New File)
Rewrite `adws/trigger_webhook.py` as a TypeScript HTTP server using Node.js built-in `http` module (no new dependencies). The file should:

- Create an HTTP server listening on `PORT` env var (default `8001`)
- Handle `POST /webhook` requests
- Read the `x-github-event` header from incoming requests
- Parse the JSON body
- For `pull_request_review_comment` and `pull_request_review` events with action `created` or `submitted`:
  - Extract `pull_request.number` from the payload
  - Spawn `npx tsx adws/adwPrReview.tsx <pr-number>` as a detached background process
  - Return `{"status": "triggered", "pr": <number>}`
- For `issues` events with action `opened`:
  - Extract `issue.number` from the payload
  - Spawn `npx tsx adws/adwPlanBuild.tsx <issue-number>` as a detached background process
  - Return `{"status": "triggered", "issue": <number>}`
- For all other events, return `{"status": "ignored"}`
- Use the `log()` function from `./utils` for logging
- Use `child_process.spawn` with `detached: true` and `stdio: 'ignore'` plus `unref()` for background processes
- Add `#!/usr/bin/env npx tsx` shebang for direct execution

### 2. Delete `adws/trigger_webhook.py`
Remove the Python file since it is being replaced by the TypeScript version.

### 3. Update `package.json`
Change the `adw:trigger-webhook` script from:
```json
"adw:trigger-webhook": "uv run adws/trigger_webhook.py"
```
to:
```json
"adw:trigger-webhook": "tsx adws/trigger_webhook.ts"
```

### 4. Update references in spec files
Update any references to `trigger_webhook.py` in:
- `specs/issue-12-plan.md` — change references to `.ts` and `npx tsx` command
- `specs/issue-10-plan.md` — change references to `.ts` if applicable

### 5. Update `.env.sample` if it references the Python file
Check and update any comments or references to the Python webhook trigger.

## Validation Commands
```bash
npm run lint
npm run build
npx tsc --noEmit -p adws/tsconfig.json 2>/dev/null || npx tsc --noEmit
```
