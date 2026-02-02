# Implementation Plan: Mark Issue as Completed When PR is Closed

## Feature Description
Automatically close the GitHub issue when its associated Pull Request is merged or closed. This enhancement to the ADW (Automated Development Workflow) will detect PR state changes and update the linked issue status accordingly.

## User Story
As a developer using the ADW system, I want the original GitHub issue to be automatically closed when its associated PR is merged, so that I don't have to manually close issues after PRs are merged and the issue tracker stays accurate.

## Problem Statement
Currently, after a PR is created by the ADW system and subsequently merged or closed, the original issue for which the PR was created remains open. This requires manual intervention to close the issue, creating extra work and risking stale open issues.

## Solution Statement
Extend the ADW system to:
1. Detect when a PR transitions to a closed/merged state via webhooks
2. Extract the linked issue number from the PR body
3. Automatically close the linked issue with a comment explaining the closure
4. Handle edge cases (already closed issues, missing issue links)

## Relevant Files

### Existing Files to Modify
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `adws/github/githubApi.ts` | GitHub API interactions | Add `closeIssue()` function |
| `adws/triggers/trigger_webhook.ts` | GitHub webhook listener | Add handler for `pull_request` events with `closed` action |
| `adws/core/dataTypes.ts` | TypeScript interfaces | Add `PullRequestEvent` interface for webhook payloads |

### New Files (if needed)
| File | Purpose |
|------|---------|
| None | All functionality can be added to existing files |

## Implementation Phases

### Phase 1: Add GitHub API Function for Closing Issues
Add a new function to `githubApi.ts` to close issues via the GitHub CLI.

### Phase 2: Add PR Webhook Event Handler
Update `trigger_webhook.ts` to handle `pull_request` events and detect closed/merged PRs.

### Phase 3: Implement Issue Closure Logic
Create the logic to extract issue number from PR and close it with an appropriate comment.

### Phase 4: Add Error Handling and Edge Cases
Handle scenarios where the issue is already closed, issue link is missing, or API calls fail.

## Step-by-Step Implementation Tasks

### Task 1: Add `closeIssue` Function to `githubApi.ts`
**File:** `adws/github/githubApi.ts`

Add a new exported function:
```typescript
export async function closeIssue(issueNumber: number, comment?: string): Promise<void>
```

**Implementation Details:**
- Use `gh issue close {issueNumber}` CLI command
- Optionally post a comment before closing using `commentOnIssue()`
- Handle errors gracefully (issue already closed, permission denied, etc.)
- Add logging for audit trail

### Task 2: Add `PullRequestWebhookPayload` Interface
**File:** `adws/core/dataTypes.ts`

Add interface for the PR webhook payload:
```typescript
export interface PullRequestWebhookPayload {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited';
  pull_request: {
    number: number;
    state: string;
    merged: boolean;
    body: string | null;
    html_url: string;
    title: string;
    base: { ref: string };
    head: { ref: string };
  };
  repository: {
    name: string;
    owner: { login: string };
    full_name: string;
  };
}
```

### Task 3: Add PR Event Handler Function
**File:** `adws/triggers/trigger_webhook.ts`

Create a new handler function:
```typescript
async function handlePullRequestEvent(payload: PullRequestWebhookPayload): Promise<void>
```

**Implementation Details:**
- Check if action is 'closed'
- Check if PR was merged (`payload.pull_request.merged === true`) or just closed
- Extract issue number from PR body using existing regex pattern: `/Implements #(\d+)/`
- Call `closeIssue()` with appropriate comment
- Log the operation for debugging

### Task 4: Register PR Event Handler in Webhook Router
**File:** `adws/triggers/trigger_webhook.ts`

Update the webhook route handler to process `pull_request` events:
- Add case for `X-GitHub-Event: pull_request` header
- Route to `handlePullRequestEvent()` when action is 'closed'
- Ensure proper async handling and error responses

### Task 5: Create Closure Comment Template
**File:** `adws/github/githubApi.ts` (or `workflowComments.ts`)

Create a formatted comment for issue closure:
```typescript
function formatIssueClosureComment(prNumber: number, prUrl: string, wasMerged: boolean): string
```

**Comment format:**
```markdown
🤖 **ADW Workflow Complete**

This issue has been {merged/closed} via PR #{prNumber}.

{If merged: "The implementation has been merged into the main branch."}
{If closed without merge: "The associated PR was closed without merging."}

[View Pull Request]({prUrl})
```

### Task 6: Add Error Handling for Edge Cases
**Implementation Details:**
- **Issue already closed:** Check issue state before attempting to close, skip if already closed
- **No issue link in PR body:** Log warning and skip (not all PRs are from ADW)
- **API failures:** Catch and log errors, don't crash the webhook handler
- **Non-ADW PRs:** Only process PRs that contain the "Implements #" pattern

### Task 7: Add Logging for Audit Trail
Ensure all operations are logged:
- When a PR closed event is received
- When an issue link is extracted
- When the issue is being closed
- When the closure is successful
- When errors occur

## Testing Strategy

### Unit Tests
1. Test `closeIssue()` function with mocked `gh` CLI
2. Test issue number extraction regex with various PR body formats
3. Test closure comment formatting

### Integration Tests
1. Test full webhook flow with mock PR closed payload
2. Test that issue is closed after PR merge
3. Test that proper comment is posted on issue

### Manual Testing
1. Create a test issue and trigger ADW workflow
2. Merge the resulting PR
3. Verify the original issue is automatically closed
4. Verify the closure comment is properly formatted

### Test Commands
```bash
# Run the tests
npm test

# Test webhook locally with curl
curl -X POST http://localhost:8001/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action":"closed","pull_request":{"number":1,"merged":true,"body":"Implements #22"}}'
```

## Acceptance Criteria

1. **AC1:** When a PR with "Implements #N" in its body is merged, issue #N is automatically closed
2. **AC2:** When a PR is closed without merging, issue #N is closed with a different message indicating it was not merged
3. **AC3:** A descriptive comment is posted on the issue before closing, explaining the closure
4. **AC4:** If the issue is already closed, no error occurs and no duplicate comment is posted
5. **AC5:** PRs without "Implements #N" in the body are ignored (no action taken)
6. **AC6:** All operations are logged for debugging purposes
7. **AC7:** Webhook handler responds quickly (< 1 second) to avoid GitHub timeouts

## Validation Commands

```bash
# Verify the implementation compiles
npx tsc --noEmit

# Run linting
npm run lint

# Run tests
npm test

# Start webhook server for manual testing
npx ts-node adws/triggers/trigger_webhook.ts

# Test with a mock payload
curl -X POST http://localhost:8001/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "closed",
    "pull_request": {
      "number": 99,
      "merged": true,
      "body": "Implements #22\n\n## Summary\nTest PR",
      "html_url": "https://github.com/test/repo/pull/99",
      "title": "Test PR",
      "state": "closed"
    },
    "repository": {
      "name": "test-repo",
      "owner": {"login": "test-owner"},
      "full_name": "test-owner/test-repo"
    }
  }'
```

## Architecture Notes

### Event Flow
```
GitHub PR Merged → Webhook Event → trigger_webhook.ts → handlePullRequestEvent()
                                                              ↓
                                                    Extract issue # from PR body
                                                              ↓
                                                    Post closure comment on issue
                                                              ↓
                                                    Close issue via gh CLI
                                                              ↓
                                                    Log success/failure
```

### Existing Pattern Alignment
- Uses existing `getRepoInfo()` for repository context
- Uses existing `commentOnIssue()` for posting comments
- Uses existing logging patterns from `adwPlanBuild.tsx`
- Uses existing `fetchPRDetails()` pattern for PR body parsing
- Follows existing error handling patterns in webhook handlers

## Dependencies
- No new dependencies required
- Uses existing `gh` CLI tool
- Uses existing TypeScript/Node.js infrastructure
