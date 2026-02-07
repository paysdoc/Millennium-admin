# Feature: AI Developer Workflow (ADW) System

## Feature Description
A comprehensive AI Developer Workflow (ADW) infrastructure with Claude Code integration that enables fully automated software development workflows. The system orchestrates AI agents to handle the complete development cycle from GitHub issue triage through implementation and PR creation.

Key capabilities:
1. **Claude Code Integration** - Agent orchestration system that runs Claude Code CLI to execute AI-powered development tasks
2. **Install/Prime Commands** - Slash commands for onboarding developers and enabling codebase familiarization
3. **Environment Configuration** - Centralized configuration management with dotenv support
4. **Project Guidelines** - Coding guidelines for maintaining code quality and consistency
5. **GitHub Issue Classification** - Haiku-powered issue classification for efficient triage (feature/bug/chore)
6. **Health Check Script** - Comprehensive validation script for verifying ADW system setup

The workflow enables a fully automated plan-and-build cycle:
- Fetch GitHub issue details via `gh` CLI
- Classify issue type using Haiku model (fast and cost-effective)
- Create feature branch automatically
- Plan Agent generates implementation plans using Opus model
- Build Agent implements the solution following the plan
- Create PR with full context linked back to the issue

## User Story
As a **developer or AI engineer**
I want to **automate the software development workflow using AI agents**
So that **GitHub issues can be automatically triaged, planned, implemented, and submitted as pull requests with minimal manual intervention**

## Problem Statement
Manual software development workflows are time-consuming and require constant context switching. Developers spend significant time on repetitive tasks like:
- Reading and classifying GitHub issues
- Creating feature branches with consistent naming
- Writing implementation plans
- Switching between planning and coding
- Creating pull requests with proper formatting

There is no standardized way to leverage AI assistance across the entire development lifecycle, leading to inconsistent quality and missed opportunities for automation.

## Solution Statement
Implement a modular ADW system that integrates Claude Code CLI to orchestrate AI agents for each phase of development:

1. **Classification Phase**: Use Haiku model (fast, cheap) to classify issues as feature/bug/chore
2. **Planning Phase**: Use Opus model (high quality) to generate detailed implementation plans
3. **Build Phase**: Use Opus model to implement solutions following the generated plans
4. **PR Phase**: Automatically create well-formatted pull requests linking back to issues

The system uses a TypeScript-based architecture with:
- Modular components for each workflow step
- JSONL streaming for real-time agent output
- GitHub CLI integration for issue and PR management
- Comprehensive health checks for environment validation

## Relevant Files
Use these files to implement the feature:

### Existing Files
- `README.md` — Project documentation that needs updating with ADW setup instructions
- `guidelines/coding_guidelines.md` — Coding guidelines defining TypeScript, functional programming, and hygiene practices
- `.env.sample` — Environment variable template showing required configuration
- `package.json` — Project dependencies and scripts (needs ADW scripts added)
- `tsconfig.json` — Root TypeScript configuration

### New Files
The following files need to be created:

#### ADW Core Modules (`adws/`)
- `adws/config.ts` — Configuration constants for Claude CLI path, GitHub PAT, logs/specs directories
- `adws/dataTypes.ts` — TypeScript interfaces for GitHub API responses, agent requests/responses, slash commands
- `adws/utils.ts` — Utility functions for ADW ID generation, slugification, logging, directory management
- `adws/claudeAgent.ts` — Core Claude Code agent runner that spawns CLI process, handles JSONL output streaming
- `adws/githubApi.ts` — GitHub API integration using `gh` CLI for fetching issues and posting comments
- `adws/gitOperations.ts` — Git operations for branch management (create, checkout) and commits
- `adws/planAgent.ts` — Plan Agent that generates implementation plans from GitHub issues
- `adws/buildAgent.ts` — Build Agent that implements solutions based on implementation plans
- `adws/pullRequestCreator.ts` — PR creation logic with formatted descriptions
- `adws/healthCheck.tsx` — Comprehensive health check script validating environment, git, Claude CLI, GitHub CLI
- `adws/adwPlanBuild.tsx` — Main workflow orchestrator combining all components
- `adws/index.ts` — Public exports for the ADW module
- `adws/tsconfig.json` — TypeScript configuration for ADW scripts

#### Claude Code Commands (`.claude/commands/`)
- `.claude/commands/install.md` — Install & prime command for onboarding
- `.claude/commands/prime.md` — Prime command for codebase familiarization
- `.claude/commands/feature.md` — Feature planning command template
- `.claude/commands/bug.md` — Bug planning command template
- `.claude/commands/chore.md` — Chore planning command template
- `.claude/commands/classify_issue.md` — Issue classification command for determining type
- `.claude/commands/implement.md` — Implementation command for executing plans

#### Claude Code Hooks (`.claude/hooks/`)
- `.claude/hooks/pre-tool-use.ts` — Pre-tool-use validation hook
- `.claude/hooks/post-tool-use.ts` — Post-tool-use processing hook
- `.claude/hooks/notification.ts` — Notification handling hook
- `.claude/hooks/stop.ts` — Stop event handling hook
- `.claude/hooks/subagent-stop.ts` — Sub-agent stop handling
- `.claude/hooks/utils/constants.ts` — Shared constants for hooks

#### Configuration
- `.claude/settings.json` — Claude Code permissions and hook configuration
- `.claude/settings.local.json` — Local overrides (e.g., WebSearch permission)

## Implementation Plan

### Phase 1: Foundation
Establish the core infrastructure and configuration needed for the ADW system:

1. **Environment Setup** - Create configuration module with dotenv integration
2. **Type Definitions** - Define TypeScript interfaces for all data structures
3. **Utility Functions** - Build helper functions for logging, ID generation, and file operations
4. **Directory Structure** - Create `adws/`, `specs/`, `logs/`, `.claude/commands/`, `.claude/hooks/` directories

### Phase 2: Core Implementation
Build the main ADW components:

1. **Claude Agent Runner** - Implement JSONL streaming interface to Claude Code CLI
2. **GitHub Integration** - Build `gh` CLI wrapper for issue fetching and commenting
3. **Git Operations** - Implement branch creation, commits, and push operations
4. **Plan Agent** - Create agent for generating implementation plans
5. **Build Agent** - Create agent for implementing solutions from plans
6. **PR Creator** - Implement automated pull request creation

### Phase 3: Integration
Connect all components and add user-facing features:

1. **Workflow Orchestrator** - Create main entry point that coordinates all phases
2. **Issue Classification** - Implement Haiku-based issue type classification
3. **Slash Commands** - Create Claude Code commands for manual workflow triggers
4. **Event Hooks** - Implement TypeScript hooks for Claude Code events
5. **Health Check** - Build comprehensive validation script
6. **Documentation** - Update README with ADW usage instructions

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Create ADW Configuration Module
- Create `adws/config.ts` with configuration constants:
  - `CLAUDE_CODE_PATH` — Path to Claude CLI (default: `/usr/local/bin/claude`)
  - `GITHUB_PAT` — GitHub Personal Access Token from environment
  - `LOGS_DIR` — Directory for workflow logs (`logs/`)
  - `SPECS_DIR` — Directory for implementation plans (`specs/`)
- Load environment variables using dotenv at module initialization
- Export configuration as typed constants

### 2. Create Data Types Module
- Create `adws/dataTypes.ts` with TypeScript interfaces:
  - `IssueClassSlashCommand` — Union type for issue classification (`'/chore' | '/bug' | '/feature'`)
  - `SlashCommand` — Full union type for all supported slash commands
  - `GitHubUser`, `GitHubLabel`, `GitHubMilestone`, `GitHubComment` — GitHub entity models
  - `GitHubIssue` — Complete GitHub issue model with all fields
  - `AgentPromptRequest`, `AgentPromptResponse` — Agent communication types
  - `ClaudeCodeResultMessage` — JSONL result message structure from Claude CLI

### 3. Create Utility Functions Module
- Create `adws/utils.ts` with helper functions:
  - `generateAdwId()` — Generate unique ADW session identifier (`adw-{timestamp}-{random}`)
  - `slugify(text)` — Convert text to URL-friendly slug (lowercase, alphanumeric, max 50 chars)
  - `log(message, level)` — Log messages with timestamp and emoji prefix
  - `ensureLogsDirectory(adwId)` — Create and return session logs directory
  - `ensureSpecsDirectory()` — Ensure specs directory exists

### 4. Create Claude Agent Runner
- Create `adws/claudeAgent.ts` with core agent functionality:
  - `runClaudeAgent(prompt, agentName, outputFile, model)` — Main function to run Claude CLI
  - Spawn Claude CLI process with arguments: `--print`, `--verbose`, `--output-format stream-json`, `--model`
  - Write prompt to stdin and close
  - Stream stdout to output file while parsing JSONL
  - Extract text from assistant messages
  - Parse result message for success status, session ID, and cost
  - Return `AgentResult` with success, output, sessionId, totalCostUsd

### 5. Create GitHub API Module
- Create `adws/githubApi.ts` using `gh` CLI:
  - `getRepoInfo()` — Extract owner/repo from git remote URL (supports HTTPS and SSH)
  - `fetchGitHubIssue(issueNumber)` — Fetch issue with all fields via `gh issue view`
  - `commentOnIssue(issueNumber, body)` — Post comment on issue via `gh issue comment`
  - Transform raw GitHub API responses to typed interfaces

### 6. Create Git Operations Module
- Create `adws/gitOperations.ts` for git management:
  - `getCurrentBranch()` — Get current branch name
  - `getMainBranch()` — Detect main/master branch
  - `generateFeatureBranchName(issueNumber, title)` — Create branch name: `feature/issue-{number}-{slug}`
  - `createFeatureBranch(issueNumber, title)` — Create and checkout branch (or checkout if exists)
  - `commitChanges(message)` — Stage all changes and commit
  - `pushBranch(branchName)` — Push branch to origin with upstream tracking

### 7. Create Plan Agent Module
- Create `adws/planAgent.ts` for generating implementation plans:
  - `formatIssueContext(issue)` — Format issue details for prompt context
  - `buildPlanPrompt(issue, issueType)` — Build comprehensive planning prompt
  - `getPlanFilePath(issueNumber)` — Return plan file path: `specs/issue-{number}-plan.md`
  - `runPlanAgent(issue, logsDir, issueType)` — Run plan agent with Opus model
  - Instruct agent to use the correct slash command format (`/feature`, `/bug`, `/chore`)

### 8. Create Build Agent Module
- Create `adws/buildAgent.ts` for implementing solutions:
  - `buildImplementPrompt(issue, planPath)` — Build implementation prompt referencing plan
  - `runBuildAgent(issue, logsDir)` — Run build agent with Opus model
  - Instruct agent to read plan, implement step-by-step, run validation commands

### 9. Create Pull Request Creator
- Create `adws/pullRequestCreator.ts`:
  - `formatPrBody(issue, planSummary, buildSummary)` — Format PR description with context
  - `createPullRequest(issue, planOutput, buildOutput)` — Create PR via `gh pr create`
  - Include issue link, plan summary, implementation summary in PR body

### 10. Create Health Check Script
- Create `adws/healthCheck.tsx` as executable script:
  - `checkEnvironmentVariables()` — Validate required env vars (`ANTHROPIC_API_KEY`)
  - `checkGitRepository()` — Verify git repo, branch, remotes, user config
  - `checkClaudeCodeCLI()` — Verify Claude CLI exists and get version
  - `checkGitHubCLI()` — Verify `gh` CLI installed and authenticated
  - `checkDirectoryStructure()` — Verify logs, specs, .claude directories
  - `checkIssueNumber(issueNumber)` — Validate issue exists and is accessible
  - Output human-readable results with status icons (✓/✗)
  - Write results to `healthCheck.jsonl` for programmatic consumption
  - Exit with code 0 on success, 1 on failure

### 11. Create Main Workflow Orchestrator
- Create `adws/adwPlanBuild.tsx` as main entry point:
  - Parse command line arguments: `<github-issue-number> [adw-id]`
  - `classifyIssue(issue, logsDir)` — Classify using Haiku model
  - Orchestrate workflow steps:
    1. Fetch GitHub issue
    2. Classify issue type
    3. Create feature branch
    4. Run Plan Agent
    5. Commit plan
    6. Post plan comment on issue
    7. Run Build Agent
    8. Commit implementation
    9. Post build comment on issue
    10. Create Pull Request
  - Map issue types to commit prefixes: `/feature` → `feat:`, `/bug` → `fix:`, `/chore` → `chore:`
  - Print workflow summary with costs

### 12. Create ADW Module Index
- Create `adws/index.ts` with public exports:
  - Export all functions from config, utils, claudeAgent, githubApi, gitOperations
  - Export Plan Agent and Build Agent functions
  - Export PR creator functions

### 13. Create Claude Code Slash Commands
- Create `.claude/commands/prime.md`:
  - Instructions to read README and run `git ls-files`
  - Summarize codebase structure and conventions
- Create `.claude/commands/install.md`:
  - Install dependencies with `npm install`
  - Update README if needed
  - Run prime command
- Create `.claude/commands/feature.md`:
  - Feature planning template with user story, requirements, phases
  - Step-by-step task format
- Create `.claude/commands/bug.md`:
  - Bug planning template with reproduction steps, root cause, fix approach
- Create `.claude/commands/chore.md`:
  - Chore planning template with description, relevant files, tasks
- Create `.claude/commands/classify_issue.md`:
  - Issue classification prompt returning `/feature`, `/bug`, or `/chore`
- Create `.claude/commands/implement.md`:
  - Implementation command that reads plan and executes tasks

### 14. Create Claude Code Hooks
- Create `.claude/hooks/utils/constants.ts` — Shared constants for hooks
- Create `.claude/hooks/pre-tool-use.ts` — Pre-tool-use validation (allow/block decisions)
- Create `.claude/hooks/post-tool-use.ts` — Post-tool-use processing
- Create `.claude/hooks/notification.ts` — Notification handling
- Create `.claude/hooks/stop.ts` — Stop event handling
- Create `.claude/hooks/subagent-stop.ts` — Sub-agent stop handling

### 15. Configure Claude Code Settings
- Create `.claude/settings.json`:
  - Define allowed Bash commands: `mkdir`, `npm`, `grep`, `ls`, `mv`, `cp`, `chmod`, `touch`, `find`, `uv`
  - Define blocked commands: `git push --force`, `git push -f`, `rm -rf`
  - Allow Write tool
  - Register all hooks with proper TypeScript execution
- Create `.claude/settings.local.json`:
  - Add local overrides (e.g., WebSearch permission)

### 16. Create ADW TypeScript Configuration
- Create `adws/tsconfig.json` with settings:
  - Target: ES2020
  - Module: NodeNext
  - ModuleResolution: NodeNext
  - Strict mode enabled
  - Include all `adws/*.ts` and `adws/*.tsx` files

### 17. Update Package.json Scripts
- Add ADW scripts to `package.json`:
  - `"adw": "tsx"` — Generic tsx runner for ADW scripts
  - `"adw:plan-build": "tsx adws/adwPlanBuild.tsx"` — Main workflow script

### 18. Update Project Documentation
- Update `README.md`:
  - Add ADW section explaining the workflow
  - Document `adws/` directory structure and modules
  - Document `.claude/` directory (commands, hooks, settings)
  - Document required environment variables for ADW
  - Add instructions for running health check
  - Add examples of running the ADW workflow

### 19. Run Validation Commands
- Execute all validation commands to verify implementation

## Testing Strategy

### Unit Tests
- Test utility functions (`generateAdwId`, `slugify`, `log`)
- Test GitHub API parsing functions
- Test git operations helpers
- Test prompt building functions
- Mock external dependencies (CLI tools, file system)

### Integration Tests
- Test health check script with real environment
- Test GitHub issue fetching with sample issue
- Test branch creation and git operations
- Verify JSONL parsing from Claude CLI output

### Edge Cases
- Handle missing environment variables gracefully
- Handle network failures when calling GitHub API
- Handle malformed GitHub issue responses
- Handle Claude CLI not found or not executable
- Handle git repository in dirty state
- Handle issue numbers that don't exist
- Handle rate limiting from GitHub API

## Acceptance Criteria
- [ ] Health check script (`npx tsx adws/healthCheck.tsx <issue_number>`) passes all checks
- [ ] Environment variables are properly loaded from `.env` using dotenv
- [ ] Issue classification returns correct type (`/feature`, `/bug`, or `/chore`) for sample issues
- [ ] Claude Code CLI is detected and version is displayed
- [ ] GitHub CLI (`gh`) is authenticated and can fetch issues
- [ ] Plan Agent generates valid markdown plan in `specs/` directory
- [ ] Build Agent successfully reads and follows implementation plans
- [ ] Feature branches are created with correct naming convention
- [ ] Pull requests are created with proper formatting and issue links
- [ ] All slash commands are accessible in Claude Code
- [ ] All hooks execute without errors
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] TypeScript compilation (`npx tsc --noEmit -p adws/tsconfig.json`) passes

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the Next.js application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` — Type-check the adws TypeScript files
- `npx tsx adws/healthCheck.tsx 2` — Run health check with issue #2 to verify system works
- `gh auth status` — Verify GitHub CLI authentication
- `claude --version` — Verify Claude Code CLI is installed

## Notes
- **Model Selection**: Haiku model is used for classification (fast and cheap ~$0.001/request), Opus model for planning and building (highest quality)
- **Logging**: All agent outputs are logged to `logs/{adw-id}/` for debugging and auditing
- **GitHub Integration**: The system uses `gh` CLI which handles authentication via OAuth or PAT
- **Environment**: Variables are loaded from `.env` using dotenv package
- **Validation**: Health check script must pass before running workflows
- **Command Format**: Slash commands in `.claude/commands/` follow a consistent format with Instructions, Read, Run, and Report sections
- **Hook Execution**: TypeScript hooks in `.claude/hooks/` are run as separate processes by Claude Code during tool execution
- **Security**: Dangerous git commands (`push --force`, `rm -rf`) are blocked in settings
- **Cost Tracking**: Each agent run reports cost in USD for monitoring API usage
