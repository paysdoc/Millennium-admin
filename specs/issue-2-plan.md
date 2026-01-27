# Chore: Set up AI Developer Workflow (ADW) System

## Chore Description
Set up a comprehensive AI Developer Workflow (ADW) infrastructure with Claude Code integration to enable automated software development workflows. The system includes:

1. **Claude Code Integration** - Agent orchestration system that runs Claude Code CLI to execute AI-powered development tasks
2. **Install/Prime Commands** - Slash commands for onboarding and codebase familiarization
3. **Environment Configuration** - Centralized configuration management with dotenv support
4. **Project Guidelines** - Coding guidelines for maintaining code quality
5. **GitHub Issue Classification** - Haiku-powered issue classification for efficient triage (feature/bug/chore)
6. **Health Check Script** - Comprehensive validation script for verifying ADW system setup

The workflow enables a fully automated plan-and-build cycle:
- Fetch GitHub issue details
- Classify issue type using Haiku model (fast and cheap)
- Create feature branch automatically
- Plan Agent generates implementation plans using Opus model
- Build Agent implements the solution following the plan
- Create PR with full context and link back to issue

## Relevant Files
Use these files to resolve the chore:

### Existing Files
- `README.md` — Project documentation that needs updating with ADW setup instructions
- `guidelines/coding_guidelines.md` — Coding guidelines that define TypeScript, functional programming, and hygiene practices
- `.env.sample` — Environment variable template showing required configuration

### New Files
The following files need to be created in the `adws/` directory:

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

### Claude Code Commands
The following slash commands need to be created in `.claude/commands/`:

- `.claude/commands/install.md` — Install & prime command for onboarding
- `.claude/commands/prime.md` — Prime command for codebase familiarization
- `.claude/commands/feature.md` — Feature planning command template
- `.claude/commands/bug.md` — Bug planning command template
- `.claude/commands/chore.md` — Chore planning command template
- `.claude/commands/classify_issue.md` — Issue classification command for determining type
- `.claude/commands/implement.md` — Implementation command for executing plans

### Claude Code Hooks
TypeScript hooks for Claude Code event handling:

- `.claude/hooks/pre-tool-use.ts` — Pre-tool-use validation hook
- `.claude/hooks/post-tool-use.ts` — Post-tool-use processing hook
- `.claude/hooks/notification.ts` — Notification handling hook
- `.claude/hooks/stop.ts` — Stop event handling hook
- `.claude/hooks/subagent-stop.ts` — Sub-agent stop event handling
- `.claude/hooks/utils/constants.ts` — Shared constants for hooks

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Create ADW Configuration Module
- Create `adws/config.ts` with configuration constants:
  - `CLAUDE_CODE_PATH` — Path to Claude CLI (default: `/usr/local/bin/claude`)
  - `GITHUB_PAT` — GitHub Personal Access Token from environment
  - `LOGS_DIR` — Directory for workflow logs (`logs/`)
  - `SPECS_DIR` — Directory for implementation plans (`specs/`)
- Load environment variables using dotenv at module initialization

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
  - Output human-readable results with status icons
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

### 12. Create Claude Code Slash Commands
- Create `.claude/commands/prime.md` — Read README, run git ls-files, summarize understanding
- Create `.claude/commands/install.md` — Install dependencies, update README, run prime
- Create `.claude/commands/feature.md` — Feature planning template with user story, requirements, implementation phases
- Create `.claude/commands/bug.md` — Bug planning template with reproduction steps, root cause, fix approach
- Create `.claude/commands/chore.md` — Chore planning template with description, relevant files, step-by-step tasks
- Create `.claude/commands/classify_issue.md` — Issue classification prompt with command mapping
- Create `.claude/commands/implement.md` — Implementation command for executing plans

### 13. Create Claude Code Hooks
- Create `.claude/hooks/pre-tool-use.ts` — Pre-tool-use validation
- Create `.claude/hooks/post-tool-use.ts` — Post-tool-use processing
- Create `.claude/hooks/notification.ts` — Notification handling
- Create `.claude/hooks/stop.ts` — Stop event handling
- Create `.claude/hooks/subagent-stop.ts` — Sub-agent stop handling
- Create `.claude/hooks/utils/constants.ts` — Shared constants

### 14. Create ADW TypeScript Configuration
- Create `adws/tsconfig.json` with TypeScript settings:
  - Target ES2020, module NodeNext
  - Strict mode enabled
  - Include all adws/*.ts files

### 15. Update Project Documentation
- Update `README.md`:
  - Add ADW section explaining the workflow
  - Document `adws/` directory structure
  - Add `.claude/` directory documentation
  - Document required environment variables for ADW
  - Add instructions for running health check

### 16. Run Validation Commands

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Type-check the adws TypeScript files
- `npx tsx adws/healthCheck.tsx 2` - Run health check with a sample issue number to verify system works

## Notes
- The ADW system uses Claude Code CLI in non-interactive mode with `--print` flag and JSONL output
- Haiku model is used for classification (fast and cheap), Opus model for planning and building (highest quality)
- All agent outputs are logged to `logs/{adw-id}/` for debugging and auditing
- The system integrates with GitHub via the `gh` CLI which handles authentication
- Environment variables are loaded from `.env` using dotenv
- The health check script validates all dependencies before running workflows
- Slash commands in `.claude/commands/` follow a consistent format with Instructions, Read, Run, and Report sections
- TypeScript hooks in `.claude/hooks/` are run as separate processes by Claude Code during tool execution
