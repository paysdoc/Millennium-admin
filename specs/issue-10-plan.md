# Feature: Add Triggers to the ADW

## Feature Description
Add two trigger mechanisms to the ADW (AI Developer Workflow) system: a **webhook trigger** and a **CRON trigger**. Both triggers detect new GitHub issues and automatically launch the existing `adwPlanBuild.tsx` workflow. The webhook trigger is a FastAPI server receiving GitHub webhook events. The CRON trigger polls GitHub at regular intervals. Both must respond within GitHub's 10-second timeout after issue creation.

## User Story
As a **repository maintainer**
I want to **automatically trigger the ADW workflow when a new issue is created**
So that **issues are processed without manual intervention using `npx tsx adws/adwPlanBuild.tsx <issue-number>`**

## Problem Statement
Currently, the ADW workflow must be triggered manually by running `npx tsx adws/adwPlanBuild.tsx <issue-number>`. There is no automated mechanism to detect new issues and kick off the workflow. This means every issue requires a human to notice it and run the command.

## Solution Statement
Implement two independent trigger scripts:

1. **Webhook trigger** (`adws/trigger_webhook.py`) — A FastAPI server that receives GitHub `issues` webhook events. When a new issue is opened, it immediately responds (within GitHub's 10s timeout) and spawns `adwPlanBuild.tsx` as a background subprocess.

2. **CRON trigger** (`adws/trigger_cron.ts`) — A TypeScript script that polls GitHub every 20 seconds using the `gh` CLI. It detects: (a) new issues without comments, or (b) issues where the latest comment body contains the keyword `adw`. When a qualifying issue is found, it launches the ADW workflow.

Both triggers are standalone scripts started manually via CLI commands.

## Relevant Files
Use these files to implement the feature:

### Existing Files (Reference)
- `adws/adwPlanBuild.tsx` — The main ADW orchestrator that both triggers will invoke. Accepts `<issue-number>` as CLI argument.
- `adws/githubApi.ts` — GitHub API functions using `gh` CLI; provides `getRepoInfo()` and `fetchGitHubIssue()` patterns to follow.
- `adws/config.ts` — Configuration and env loading; the CRON trigger should use similar patterns.
- `adws/utils.ts` — Logging utilities (`log()`, `generateAdwId()`).
- `adws/dataTypes.ts` — TypeScript type definitions including `GitHubIssue`.
- `package.json` — Scripts section; will add trigger run scripts.
- `.env.sample` — Environment variable documentation; will add PORT variable.

### New Files
- `adws/trigger_webhook.py` — FastAPI webhook server (Python, run with `uv run`).
- `adws/trigger_cron.ts` — CRON polling trigger (TypeScript, run with `npx tsx`).

## Implementation Plan

### Phase 1: Webhook Trigger (Python/FastAPI)
Create a FastAPI server that:
- Listens on configurable PORT (default 8001)
- Accepts POST requests at `/webhook` for GitHub webhook payloads
- Validates the event is an `issues` event with action `opened`
- Immediately returns 200 response (to meet GitHub's 10s timeout)
- Spawns `npx tsx adws/adwPlanBuild.tsx <issue-number>` as a detached background process
- Logs trigger activity to stdout

### Phase 2: CRON Trigger (TypeScript)
Create a TypeScript polling script that:
- Runs in a loop, polling every 20 seconds
- Uses `gh` CLI to list open issues
- Detects qualifying issues: (a) no comments, or (b) latest comment contains `adw`
- Tracks already-processed issue numbers in memory to avoid re-triggering
- Spawns `npx tsx adws/adwPlanBuild.tsx <issue-number>` as a detached background process for each qualifying issue
- Logs activity to stdout

### Phase 3: Integration
- Add npm scripts for both triggers to `package.json`
- Document PORT env variable in `.env.sample`

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Create the Webhook Trigger (`adws/trigger_webhook.py`)
- Create `adws/trigger_webhook.py` with the following structure:
  - Import FastAPI, uvicorn, subprocess, os, sys
  - Read PORT from environment (default 8001)
  - Define a POST `/webhook` endpoint
  - Parse the JSON body; check `X-GitHub-Event` header equals `issues`
  - Check `action` field equals `opened`
  - Extract `issue.number` from the payload
  - Spawn `npx tsx adws/adwPlanBuild.tsx <issue-number>` using `subprocess.Popen` with detached process (so it doesn't block)
  - Return `{"status": "triggered", "issue": <number>}` immediately
  - For non-matching events, return `{"status": "ignored"}`
  - Add `if __name__ == "__main__"` block that runs uvicorn on the configured PORT
- Use inline script metadata (PEP 723) to declare `fastapi` and `uvicorn` dependencies so `uv run` can install them automatically:
  ```python
  # /// script
  # dependencies = ["fastapi", "uvicorn"]
  # ///
  ```

### 2. Create the CRON Trigger (`adws/trigger_cron.ts`)
- Create `adws/trigger_cron.ts` with the following structure:
  - Import `execSync`, `spawn` from `child_process`
  - Import `getRepoInfo` from `./githubApi`
  - Import `log` from `./utils`
  - Define a `Set<number>` to track processed issue numbers
  - Define `POLL_INTERVAL_MS = 20_000` (20 seconds)
  - Create function `fetchOpenIssues()` that uses `gh issue list --repo owner/repo --state open --json number,comments,createdAt` to get open issues
  - Create function `isQualifyingIssue(issue)` that returns true if:
    - Issue has no comments (comments array is empty), OR
    - The latest comment body (last element) contains the string `adw` (case-insensitive)
  - Create function `checkAndTrigger()` that:
    - Calls `fetchOpenIssues()`
    - Filters for qualifying issues not in the processed set
    - For each qualifying issue, adds it to the processed set and spawns `npx tsx adws/adwPlanBuild.tsx <issue-number>` as a detached process using `spawn` with `detached: true` and `stdio: 'ignore'`, calling `unref()` so the parent doesn't wait
  - Create main loop using `setInterval(checkAndTrigger, POLL_INTERVAL_MS)` and call `checkAndTrigger()` immediately on start
  - Log each poll cycle and each triggered issue

### 3. Add npm Scripts to `package.json`
- Add the following scripts to the `scripts` section of `package.json`:
  - `"adw:trigger-webhook": "uv run adws/trigger_webhook.py"` — Start the webhook trigger
  - `"adw:trigger-cron": "tsx adws/trigger_cron.ts"` — Start the CRON trigger

### 4. Update `.env.sample` with PORT Variable
- Add `PORT=8001` with a comment explaining it's used by the webhook trigger

### 5. Run Validation Commands
- Execute all validation commands to verify the changes work correctly with zero regressions

## Testing Strategy

### Unit Tests
- No formal unit test framework is set up in this project. Validation is done via lint and build checks.

### Integration Tests
- **Webhook trigger**: Start the server locally, send a mock `POST /webhook` with a sample GitHub issues payload using `curl`, verify the response is `{"status": "triggered", "issue": <number>}` and that the background process was spawned.
- **CRON trigger**: Start the script, create a test issue, verify the script detects it within 20 seconds and spawns the workflow.

### Edge Cases
- Webhook receives non-`issues` event (should return `ignored`)
- Webhook receives `issues` event with action other than `opened` (should return `ignored`)
- CRON trigger encounters an issue that already has ADW workflow comments (should be tracked in processed set after first detection)
- CRON trigger restarts and re-scans issues (issues with existing ADW comments will have comments, so only those with `adw` in latest comment will re-trigger — this is intentional for the resume case)
- Multiple issues created simultaneously (both triggers should handle concurrent spawns)

## Acceptance Criteria
- [ ] `adws/trigger_webhook.py` exists and can be started with `uv run adws/trigger_webhook.py`
- [ ] Webhook trigger responds to GitHub issue `opened` events by spawning `adwPlanBuild.tsx` in the background
- [ ] Webhook trigger returns HTTP response immediately (within 10s timeout)
- [ ] `adws/trigger_cron.ts` exists and can be started with `npx tsx adws/trigger_cron.ts`
- [ ] CRON trigger polls every 20 seconds and detects new issues without comments
- [ ] CRON trigger detects issues where the latest comment contains `adw`
- [ ] CRON trigger does not re-process already-triggered issues
- [ ] Both triggers spawn `adwPlanBuild.tsx` as a detached background process
- [ ] npm scripts `adw:trigger-webhook` and `adw:trigger-cron` are added to `package.json`
- [ ] `.env.sample` documents the PORT variable
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the application to verify no build errors
- `python -c "import ast; ast.parse(open('adws/trigger_webhook.py').read()); print('Python syntax OK')"` — Verify Python syntax is valid
- `npx tsx --eval "import './adws/trigger_cron'"` — Verify TypeScript trigger compiles (will start polling, Ctrl+C to stop)

## Notes
- **No new npm dependencies needed**: The CRON trigger uses `child_process` (Node built-in) and existing `adws/` modules.
- **Python dependency management**: The webhook uses `uv run` with PEP 723 inline script metadata, so `fastapi` and `uvicorn` are installed automatically — no `requirements.txt` or `pyproject.toml` needed.
- **Security**: The webhook does not implement GitHub webhook secret validation. For production use, HMAC signature verification should be added. This is acceptable for local development use.
- **Process management**: Both triggers spawn `adwPlanBuild.tsx` as fully detached processes. If the trigger is stopped, already-spawned workflows continue running.
- **PORT**: The webhook defaults to port 8001 to avoid conflicting with the Next.js dev server on port 3000.
