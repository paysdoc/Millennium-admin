# Bug Fix: Deploy to Preview/Staging GitHub Actions Workflow Permissions

## Bug Description
The GitHub Actions workflow fails when attempting to post deployment preview URL comments on pull requests. The `deploy-preview` job in `.github/workflows/deploy.yml` encounters a 403 "Resource not accessible by integration" error when calling `github.rest.issues.createComment()` via `actions/github-script@v7`.

The error occurs because the workflow job lacks the required GitHub token permissions to create issue comments. GitHub Actions uses a default token with restricted permissions, and explicit permission grants are required for write operations on issues and pull requests.

## User Story
As a **developer opening a pull request**
I want to **see an automatic comment with the preview deployment URL**
So that **I can easily access and verify my changes in the preview environment before merging**

## Problem Statement
When the `deploy-preview` job runs on pull request events, it successfully deploys to Vercel but fails when attempting to post the preview URL as a comment on the PR. The error log shows:

```
Error: Unhandled error: HttpError: Resource not accessible by integration
status: 403
URL: https://api.github.com/repos/paysdoc/Millennium-admin/issues/4/comments
```

The response headers indicate the required permissions:
```
'x-accepted-github-permissions': 'issues=write; pull_requests=write'
```

**Root Cause:**
The `deploy-preview` job is missing the `permissions` block that grants the GitHub Actions token the necessary scopes to write comments. Unlike the `deploy-production` job which has `permissions: { contents: write }`, the `deploy-preview` job has no permissions configuration and falls back to the default restricted token permissions.

## Solution Statement
Add an explicit `permissions` block to the `deploy-preview` job granting `issues: write` and `pull-requests: write` permissions. This follows the GitHub Actions security best practice of requesting only the minimum permissions required for each job.

The fix involves:
1. Adding `permissions` block to `deploy-preview` job with `issues: write` and `pull-requests: write`
2. Optionally updating the `deploy-production` job to add `pull-requests: write` if similar comment functionality is added in the future

## Relevant Files
Use these files to implement the fix:

### Existing Files to Modify
- `.github/workflows/deploy.yml` — The main deployment workflow containing the `deploy-preview` job that needs the permissions fix

### Reference Files (Read Only)
- `specs/adw-workflow-issue-comments.md` — Documentation for how workflow comments work in this project
- GitHub Actions documentation on workflow permissions

## Implementation Plan

### Phase 1: Analysis and Verification
Understand the current state and confirm the root cause:

1. **Review Current Workflow** - Analyze the `deploy.yml` structure and identify all jobs that interact with issues/PRs
2. **Identify Permission Gaps** - Confirm which jobs need additional permissions based on their GitHub API calls
3. **Research Best Practices** - Verify the correct permission syntax for GitHub Actions

### Phase 2: Implementation
Apply the fix:

1. **Add Permissions to deploy-preview** - Add the `permissions` block with required scopes
2. **Verify Syntax** - Ensure the YAML structure is valid

### Phase 3: Validation
Test and verify the fix works:

1. **Lint Check** - Run linter to verify YAML syntax
2. **Build Check** - Verify the project still builds correctly
3. **Manual Testing** - Create a test PR to verify comments are posted successfully

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add Permissions Block to deploy-preview Job
- Open `.github/workflows/deploy.yml`
- Locate the `deploy-preview` job (line 29)
- Add the following `permissions` block immediately after the job name and before `runs-on`:
  ```yaml
  permissions:
    issues: write
    pull-requests: write
  ```
- The `issues: write` permission allows creating comments on issues (which includes PR comments)
- The `pull-requests: write` permission is required for PR-specific operations
- This follows the principle of least privilege by only requesting the permissions actually needed

### 2. Validate YAML Syntax
- Verify the updated YAML file has correct indentation
- Ensure the permissions block is at the same indentation level as `runs-on` and `if`
- Confirm no syntax errors were introduced

### 3. Run Validation Commands
- Execute all validation commands to verify the fix doesn't break the build or linting

## Testing Strategy

### Integration Tests
- Create a test branch with a minor change
- Open a pull request from the test branch to trigger the `deploy-preview` job
- Verify the deployment comment is successfully posted on the PR
- Check GitHub Actions logs for successful completion of the "Comment Preview URL" step

### Verification Checklist
- [ ] The workflow YAML is valid (passes `yamllint` or GitHub's workflow validator)
- [ ] The `deploy-preview` job has the `permissions` block with correct scopes
- [ ] PR comment is successfully created after deployment
- [ ] No HTTP 403 errors in the GitHub Actions logs
- [ ] The deployment itself still works correctly

### Edge Cases
- Ensure the fix works for PRs from forks (external contributors)
- Verify behavior when the PR is opened but not yet merged
- Confirm the fix works for re-runs of failed workflows

## Acceptance Criteria
- [ ] The `deploy-preview` job includes `permissions: { issues: write, pull-requests: write }`
- [ ] GitHub Actions workflow syntax is valid
- [ ] Preview deployment comments are successfully posted on pull requests
- [ ] No 403 "Resource not accessible by integration" errors occur
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully

## Validation Commands
Execute every command to validate the fix works correctly with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the Next.js application to verify no build errors

## Notes
- **Security Consideration**: The permissions granted are the minimum required for the comment functionality. Do not add broader permissions like `contents: write` unless specifically needed.
- **Fork PRs**: For pull requests from forks, GitHub may still restrict some permissions. If issues persist for fork PRs, consider using the `pull_request_target` event (with caution) or implementing a separate workflow triggered by workflow_run.
- **GitHub Token**: The `secrets.GITHUB_TOKEN` is automatically provided by GitHub Actions; no additional secrets configuration is needed.
- **Alternative Approach**: If granular permissions continue to cause issues, consider using a Personal Access Token (PAT) stored as a repository secret, though this is less secure and not recommended unless necessary.

## Code Changes Summary

### Before (`.github/workflows/deploy.yml` - lines 29-32):
```yaml
  deploy-preview:
    name: Deploy to Preview/Staging
    runs-on: ubuntu-latest
    if: github.ref != 'refs/heads/main' && github.event_name != 'workflow_dispatch'
```

### After:
```yaml
  deploy-preview:
    name: Deploy to Preview/Staging
    runs-on: ubuntu-latest
    if: github.ref != 'refs/heads/main' && github.event_name != 'workflow_dispatch'
    permissions:
      issues: write
      pull-requests: write
```
