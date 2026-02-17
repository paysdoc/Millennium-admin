# AI Developer Workflow (ADW) System

ADW automates software development by integrating GitHub issues with Claude Code CLI to classify issues, generate plans, implement solutions, and create pull requests.

## Key Concepts

### ADW ID
Each workflow run is assigned a unique 8-character identifier (e.g., `a1b2c3d4`). This ID:
- Tracks all phases of a workflow (plan → build → test → review → document)
- Appears in GitHub comments, commits, and PR titles
- Creates an isolated workspace at `agents/{adwId}/`
- Enables resuming workflows and debugging

### State Management
ADW uses persistent state files (`agents/{adwId}/adw_state.json`) to:
- Share data between workflow phases
- Enable workflow composition and chaining
- Track essential workflow data:
  - `adwId`: Unique workflow identifier
  - `issueNumber`: GitHub issue being processed
  - `branchName`: Git branch for changes
  - `planFile`: Path to implementation plan
  - `issueClass`: Issue type (`/chore`, `/bug`, `/feature`)

### Workflow Composition
Workflows can be:
- Run individually (e.g., just planning or just building)
- Combined in orchestrator scripts (e.g., `adwPlanBuildTestReview.tsx` runs plan, build, test, and review phases)

## Quick Start

### 1. Set Environment Variables

```bash
export GITHUB_REPO_URL="https://github.com/owner/repository"
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export CLAUDE_CODE_PATH="/path/to/claude"  # Optional, defaults to "claude"
export GITHUB_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # Optional, only if using different account than 'gh auth login'
```

### 2. Install Prerequisites

```bash
# GitHub CLI
brew install gh              # macOS
# or: sudo apt install gh    # Ubuntu/Debian
# or: winget install --id GitHub.cli  # Windows

# Claude Code CLI
# Follow instructions at https://docs.anthropic.com/en/docs/claude-code

# Node.js dependencies (tsx is included as a devDependency)
npm install

# Authenticate GitHub
gh auth login
```

### 3. Run ADW

```bash
# Process a single issue manually (plan + build)
npx tsx adws/adwPlanBuild.tsx 123

# Process a single issue with testing (plan + build + test)
npx tsx adws/adwPlanBuildTest.tsx 123

# Process with review (plan + build + test + review)
npx tsx adws/adwPlanBuildTestReview.tsx 123

# Run individual phases
npx tsx adws/adwPlan.tsx 123               # Planning phase only
npx tsx adws/adwBuild.tsx 123 <adw-id>     # Build phase only (requires existing plan)

# Run continuous monitoring (polls every 20 seconds)
npx tsx adws/triggers/trigger_cron.ts

# Start webhook server (for instant GitHub events)
npx tsx adws/triggers/trigger_webhook.ts
```

> **Not yet ported to TypeScript:** `adwTest` (standalone), `adwReview` (standalone), `adwDocument`, `adwPatch`, `adwPlanBuildReview`, `adwPlanBuildDocument`, `adwSdlc`. See individual sections below for details.

## ADW Workflow Scripts

### Individual Phase Scripts

#### adwPlan.tsx - Planning Phase
Creates implementation plans for GitHub issues.

**Requirements:**
- GitHub issue number
- Issue must be open and accessible

**Usage:**
```bash
npx tsx adws/adwPlan.tsx <issueNumber> [adw-id]
```

**What it does:**
1. Fetches issue details from GitHub
2. Classifies issue type (`/chore`, `/bug`, `/feature`)
3. Creates feature branch with semantic naming
4. Generates detailed implementation plan
5. Commits plan as `{adwId}_plan_spec.md`
6. Creates/updates pull request
7. Outputs state JSON for chaining

#### adwBuild.tsx - Implementation Phase
Implements solutions based on existing plans.

**Requirements:**
- Existing plan file (from `adwPlan.tsx` or manual)

**Usage:**
```bash
# With explicit arguments
npx tsx adws/adwBuild.tsx <issueNumber> <adw-id>
```

**What it does:**
1. Locates existing plan file
2. Implements solution per plan specifications
3. Commits implementation changes
4. Updates pull request

#### adwTest - Testing Phase
> **Status: Not yet ported to TypeScript.** Testing is available as part of orchestrator pipelines (e.g., `adwPlanBuildTest.tsx`).

Runs test suites and handles test failures.

**Requirements:**
- Working directory with test suite
- Optional: E2E test setup

**What it does:**
1. Runs application test suite
2. Optionally runs E2E tests (browser automation)
3. Auto-resolves test failures (up to 3 attempts)
4. Reports results to GitHub issue
5. Commits test results

#### adwPrReview.tsx - Review Phase
Reviews implementation against specifications.

**Requirements:**
- Existing specification file
- Completed implementation
- ADW ID is required

**Usage:**
```bash
npx tsx adws/adwPrReview.tsx <issueNumber> <adw-id> [--skip-resolution]
```

**What it does:**
1. Locates specification file
2. Reviews implementation for spec compliance
3. Captures screenshots of functionality
4. Identifies issues (blockers, tech debt, skippable)
5. Auto-resolves blockers (unless `--skip-resolution`)
6. Uploads screenshots to cloud storage
7. Posts detailed review report

#### adwDocument - Documentation Phase
> **Status: Not yet ported to TypeScript.**

Generates comprehensive documentation.

**Requirements:**
- Completed review phase (needs review artifacts)
- ADW ID is mandatory

**What it does:**
1. Analyzes implementation and review results
2. Generates technical documentation
3. Creates user-facing guides
4. Includes screenshots from review
5. Commits to `app_docs/` directory

#### adwPatch - Direct Patch Workflow
> **Status: Not yet ported to TypeScript.**

Quick patches triggered by 'adwPatch' keyword.

**Requirements:**
- Issue or comment containing 'adwPatch' keyword
- Clear change request in the content

**What it does:**
1. Searches for 'adwPatch' in issue/comments
2. Creates targeted patch plan
3. Implements specific changes
4. Commits and creates PR
5. Skips full planning phase

### Orchestrator Scripts

#### adwPlanBuild.tsx - Plan + Build
Combines planning and implementation phases.

**Usage:**
```bash
npx tsx adws/adwPlanBuild.tsx <issueNumber> [adw-id]
```

#### adwPlanBuildTest.tsx - Plan + Build + Test
Full pipeline with automated testing.

**Usage:**
```bash
npx tsx adws/adwPlanBuildTest.tsx <issueNumber> [adw-id]
```

**Phases:**
1. Planning (creates implementation spec)
2. Building (implements solution)
3. Testing (runs test suite, auto-fixes failures)

#### adwPlanBuildTestReview.tsx - Plan + Build + Test + Review
Complete pipeline with quality review.

**Usage:**
```bash
npx tsx adws/adwPlanBuildTestReview.tsx <issueNumber> [adw-id]
```

**Phases:**
1. Planning (creates implementation spec)
2. Building (implements solution)
3. Testing (ensures functionality)
4. Review (validates against spec, auto-fixes issues)

#### adwPlanBuildReview - Plan + Build + Review
> **Status: Not yet ported to TypeScript.**

Pipeline with review but skipping tests.

**Phases:**
1. Planning (creates implementation spec)
2. Building (implements solution)
3. Review (validates against spec without test results)

**Note:** Review phase evaluates implementation against specification but without test verification. Best for non-critical changes or when testing is handled separately.

#### adwPlanBuildDocument - Plan + Build + Document
> **Status: Not yet ported to TypeScript.**

Fast documentation pipeline skipping tests and review.

**Phases:**
1. Planning (creates implementation spec)
2. Building (implements solution)
3. Document (generates documentation without screenshots)

#### adwSdlc - Complete SDLC
> **Status: Not yet ported to TypeScript.**

Full Software Development Life Cycle automation.

**Phases:**
1. **Plan**: Creates detailed implementation spec
2. **Build**: Implements the solution
3. **Test**: Runs comprehensive test suite
4. **Review**: Validates implementation vs spec
5. **Document**: Generates technical and user docs

**Output:**
- Feature implementation
- Passing tests
- Review report with screenshots
- Complete documentation in `app_docs/`

### Automation Triggers

#### trigger_cron.ts - Polling Monitor
Continuously monitors GitHub for triggers.

**Usage:**
```bash
npx tsx adws/triggers/trigger_cron.ts
```

**Triggers on:**
- New issues with no comments
- Any issue where latest comment is exactly "adw"
- Polls every 20 seconds

**Workflow selection:**
- Uses `adwPlanBuild.tsx` by default
- Excludes `adwBuild` (implementation-only) workflows

#### trigger_webhook.ts - Real-time Events
Webhook server for instant GitHub event processing.

**Usage:**
```bash
npx tsx adws/triggers/trigger_webhook.ts
```

**Configuration:**
- Default port: 8001
- Endpoints:
  - `/gh-webhook` - GitHub event receiver
  - `/health` - Health check
- GitHub webhook settings:
  - Payload URL: `https://your-domain.com/gh-webhook`
  - Content type: `application/json`
  - Events: Issues, Issue comments

**Security:**
- Validates GitHub webhook signatures
- Requires `GITHUB_WEBHOOK_SECRET` environment variable

## How ADW Works

1. **Issue Classification**: Analyzes GitHub issue and determines type:
   - `/chore` - Maintenance, documentation, refactoring
   - `/bug` - Bug fixes and corrections
   - `/feature` - New features and enhancements

2. **Planning**: `planAgent` creates implementation plan with:
   - Technical approach
   - Step-by-step tasks
   - File modifications
   - Testing requirements

3. **Implementation**: `buildAgent` executes the plan:
   - Analyzes codebase
   - Implements changes
   - Runs tests
   - Ensures quality

4. **Integration**: Creates git commits and pull request:
   - Semantic commit messages
   - Links to original issue
   - Implementation summary

## Common Usage Scenarios

### Process a bug report
```bash
# User reports bug in issue #789
npx tsx adws/adwPlanBuild.tsx 789
# ADW analyzes, creates fix, and opens PR
```

### Run full pipeline
```bash
# Complete pipeline with testing
npx tsx adws/adwPlanBuildTest.tsx 789
# ADW plans, builds, and tests the solution
```

### Run complete SDLC
> **Status: Not yet ported to TypeScript.**
```bash
# Full SDLC with review and documentation
npx tsx adws/adwSdlc.tsx 789
# ADW plans, builds, tests, reviews, and documents the solution
# Creates comprehensive documentation in app_docs/
```

### Run individual phases
```bash
# Plan only
npx tsx adws/adwPlan.tsx 789

# Build based on existing plan
npx tsx adws/adwBuild.tsx 789 <adw-id>
```

### Enable automatic processing
```bash
# Start cron monitoring
npx tsx adws/triggers/trigger_cron.ts
# New issues are processed automatically
# Users can comment "adw" to trigger processing
```

### Deploy webhook for instant response
```bash
# Start webhook server
npx tsx adws/triggers/trigger_webhook.ts
# Configure in GitHub settings
# Issues processed immediately on creation
```

## Troubleshooting

### Environment Issues
```bash
# Check required variables
env | grep -E "(GITHUB|ANTHROPIC|CLAUDE)"

# Verify GitHub auth
gh auth status

# Test Claude Code
claude --version
```

### Common Errors

**"Claude Code CLI is not installed"**
```bash
which claude  # Check if installed
# Reinstall from https://docs.anthropic.com/en/docs/claude-code
```

**"Missing GITHUB_PAT"** (Optional - only needed if using different account than 'gh auth login')
```bash
export GITHUB_PAT=$(gh auth token)
```

**"Agent execution failed"**
```bash
# Check agent output
cat agents/*/sdlc_planner/raw_output.jsonl | tail -1 | jq .
```

### Debug Mode
```bash
export ADW_DEBUG=true
npx tsx adws/adwPlanBuild.tsx 123  # Verbose output
```

## Configuration

### ADW Tracking
Each workflow run gets a unique 8-character ID (e.g., `a1b2c3d4`) that appears in:
- Issue comments: `a1b2c3d4_ops: ✅ Starting ADW workflow`
- Output files: `agents/a1b2c3d4/sdlc_planner/raw_output.jsonl`
- Git commits and PRs

### Model Selection
Edit `agents/claudeAgent.ts` to change model:
- `model: "sonnet"` - Faster, lower cost (default)
- `model: "opus"` - Better for complex tasks

### Modular Architecture
The system uses a modular TypeScript architecture with composable scripts:

- **State Management**: `core/agentState.ts` manages workflow state and chaining
- **Git Operations**: Centralized git operations in `github/gitOperations.ts`
- **Workflow Phases**: Phase implementations in `phases/` directory
- **Agent Integration**: Standardized Claude Code CLI interface in `agents/claudeAgent.ts`
- **Type Definitions**: TypeScript types in `core/dataTypes.ts`, `core/agentTypes.ts`, `core/workflowTypes.ts`

### Orchestrator Composition
Orchestrators combine phases internally, managing state between each step:
```bash
# Use an orchestrator that combines the phases you need
npx tsx adws/adwPlanBuild.tsx 123            # plan + build
npx tsx adws/adwPlanBuildTest.tsx 123         # plan + build + test
npx tsx adws/adwPlanBuildTestReview.tsx 123   # plan + build + test + review
```

### Workflow Output Structure

Each ADW workflow creates an isolated workspace:

```
agents/
└── {adwId}/                     # Unique workflow directory
    ├── adw_state.json            # Persistent state file
    ├── {adwId}_plan_spec.md     # Implementation plan
    ├── planner/                  # Planning agent output
    │   └── raw_output.jsonl      # Claude Code session
    ├── implementor/              # Implementation agent output
    │   └── raw_output.jsonl
    ├── tester/                   # Test agent output
    │   └── raw_output.jsonl
    ├── reviewer/                 # Review agent output
    │   ├── raw_output.jsonl
    │   └── review_img/           # Screenshots directory
    ├── documenter/               # Documentation agent output
    │   └── raw_output.jsonl
    └── patch_*/                  # Patch resolution attempts

app_docs/                         # Generated documentation
└── features/
    └── {feature_name}/
        ├── overview.md
        ├── technical-guide.md
        └── images/
```

## Security Best Practices

- Store tokens as environment variables, never in code
- Use GitHub fine-grained tokens with minimal permissions
- Set up branch protection rules
- Require PR reviews for ADW changes
- Monitor API usage and set billing alerts

## Technical Details

### Core Components

**Agents** (`agents/`):
- `claudeAgent.ts` - Claude Code CLI integration
- `planAgent.ts` - Planning agent implementation
- `buildAgent.ts` - Build/implementation agent
- `testAgent.ts` - Testing agent
- `reviewAgent.ts` - Review agent
- `gitAgent.ts` - Git operations agent
- `patchAgent.ts` - Patch/quick-fix agent
- `tokenManager.ts` - Token count management

**Core** (`core/`):
- `agentTypes.ts` - Agent type definitions
- `agentState.ts` - State management for workflow chaining
- `workflowTypes.ts` - Workflow-related types
- `dataTypes.ts` - General data type definitions
- `config.ts` - Configuration management
- `utils.ts` - Utility functions

**GitHub** (`github/`):
- `githubApi.ts` - Core GitHub API wrapper
- `gitOperations.ts` - Git command operations (branching, commits, PRs)
- `issueApi.ts` - GitHub issue API operations
- `prApi.ts` - Pull request API operations
- `pullRequestCreator.ts` - PR creation logic
- `workflowCommentsBase.ts` - Workflow comment management

**Phases** (`phases/`):
- `planPhase.ts` - Planning phase implementation
- `buildPhase.ts` - Build phase implementation
- `testPhase.ts` - Testing phase implementation
- `prReviewPhase.ts` - PR review phase implementation

**Orchestrators** (root `.tsx` files):
- `adwPlan.tsx` - Planning phase workflow
- `adwBuild.tsx` - Implementation phase workflow
- `adwPlanBuild.tsx` - Plan + build orchestration
- `adwPlanBuildTest.tsx` - Plan + build + test orchestration
- `adwPlanBuildTestReview.tsx` - Plan + build + test + review orchestration
- `adwPrReview.tsx` - Standalone PR review orchestration

**Triggers** (`triggers/`):
- `issueClassifier.ts` - Issue classification logic
- `trigger_cron.ts` - Cron-based polling monitor
- `trigger_webhook.ts` - Webhook-based event handler

### Branch Naming
```
{type}-{issueNumber}-{adwId}-{slug}
```
Example: `feat-456-e5f6g7h8-add-user-authentication`
