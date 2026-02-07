# Feature: Add Agent State Control to ADW

## Feature Description
Add a file-based state management system to the ADW (AI Developer Workflow) flow that tracks each agent's execution state and context. This feature introduces a hierarchical state directory structure under `<project root>/agents/` where each agent stores its execution context, logs, and outputs. The state system enables better observability, debugging, recovery, and allows agents to read shared context rather than relying on hardcoded values or re-deriving information.

## User Story
As a developer using the ADW system
I want each agent to maintain persistent file-based state during execution
So that I can track agent progress, debug issues, recover from failures, and have agents share context seamlessly

## Problem Statement
Currently, ADW agents rely on:
1. GitHub comments for state recovery (which is limited and requires parsing)
2. JSONL log files that capture raw output but lack structured state
3. In-memory context passed between workflow stages that's lost on failure
4. Hardcoded or derived values instead of reading from a shared state

This makes debugging difficult, recovery incomplete, and creates tight coupling between agent stages.

## Solution Statement
Implement a file-based state management system with:
1. A new `AgentStateManager` class to handle state read/write operations
2. A hierarchical directory structure under `agents/` for each ADW session
3. Nested directories for orchestrator agents containing their called agents' state
4. Standardized state files: `execution.log` for logs, `state.json` for structured state
5. Support for raw output files (JSON/JSONL) when agents produce structured output
6. Update all agents and orchestrators to write to and read from state

## Relevant Files
Use these files to implement the feature:

### Existing Files to Modify
- `adws/core/config.ts` - Add `AGENTS_STATE_DIR` constant for the root agents directory
- `adws/core/dataTypes.ts` - Add `AgentState` interface and related types
- `adws/core/utils.ts` - Add state directory utilities (similar to `ensureLogsDirectory`)
- `adws/core/index.ts` - Export new state-related utilities
- `adws/agents/claudeAgent.ts` - Integrate state writing during agent execution
- `adws/agents/planAgent.ts` - Write state and read from shared context
- `adws/agents/buildAgent.ts` - Write state and read from shared context
- `adws/adwPlanBuild.tsx` - Initialize orchestrator state and pass state context to agents
- `adws/adwPrReview.tsx` - Initialize orchestrator state for PR review workflow
- `.gitignore` - Add `/agents` to ignored files

### New Files
- `adws/core/agentState.ts` - AgentStateManager class with state read/write logic
- `adws/__tests__/agentState.test.ts` - Unit tests for AgentStateManager

## Implementation Plan

### Phase 1: Foundation
Define the state interfaces and create the core AgentStateManager class that handles all file-based state operations. This includes creating state directories, writing state files, appending to execution logs, and reading state from parent agents.

### Phase 2: Core Implementation
Integrate the AgentStateManager into the existing agent infrastructure:
- Modify `claudeAgent.ts` to write execution progress to state
- Update orchestrators (`adwPlanBuild.tsx`, `adwPrReview.tsx`) to initialize state and pass context
- Ensure each agent writes its state at key points during execution

### Phase 3: Integration
Update all agents to:
- Read shared context from parent state when available
- Write their outputs to state for downstream agents
- Store raw JSON/JSONL outputs alongside the state

## Step by Step Tasks

### Step 1: Define State Types in dataTypes.ts
- Add `AgentState` interface with required fields: `adwId`, `issueNumber`, `branchName`, `planFile`, `issueClass`
- Add `AgentExecutionState` interface for tracking execution status
- Add `AgentIdentifier` type for naming agents consistently
- Export all new types from the core index

### Step 2: Add Configuration Constants
- Add `AGENTS_STATE_DIR` constant in `config.ts` pointing to `<project root>/agents`
- Ensure the constant uses `process.cwd()` for proper path resolution

### Step 3: Create AgentStateManager Class
- Create `adws/core/agentState.ts` with the `AgentStateManager` class
- Implement `initializeState(adwId, agentIdentifier, parentAgentPath?)` method
  - Creates directory structure: `agents/{adwId}/{agentIdentifier}/`
  - For nested agents: `agents/{adwId}/{parentAgent}/{agentIdentifier}/`
  - Returns the state directory path
- Implement `writeState(statePath, state: AgentState)` method
  - Writes state to `state.json` in the agent's directory
  - Merges with existing state if present
- Implement `readState(statePath): AgentState | null` method
  - Reads and parses `state.json` from the agent's directory
- Implement `appendLog(statePath, message: string, prompt?: string)` method
  - Appends to `execution.log` with timestamps
  - First entry should include the prompt if provided
- Implement `writeRawOutput(statePath, filename, data)` method
  - Writes raw JSON/JSONL output files
- Implement `readParentState(statePath): AgentState | null` method
  - Traverses up the directory tree to find parent agent state
- Export the class and utility functions

### Step 4: Add State Utilities in utils.ts
- Add `ensureAgentStateDirectory(adwId, agentIdentifier, parentPath?)` function
  - Creates the state directory structure
  - Returns the full path to the state directory
- Add `getAgentStatePath(adwId, agentIdentifier, parentPath?)` function
  - Returns the path without creating directories (for reading)

### Step 5: Update .gitignore
- Add `/agents` entry to ignore the state directory from version control

### Step 6: Update claudeAgent.ts for State Integration
- Add optional `statePath` parameter to `runClaudeAgent` function
- If statePath provided:
  - Write prompt to execution.log at start
  - Append progress updates to execution.log
  - Write final result summary to state.json
  - Write raw JSONL output to `output.jsonl` in state directory
- Update `AgentResult` interface to include `statePath`

### Step 7: Update adwPlanBuild.tsx Orchestrator
- Initialize orchestrator state at workflow start:
  - Create state directory: `agents/{adwId}/orchestrator/`
  - Write initial state with adwId, issueNumber
- Pass state context to classifier agent:
  - State path: `agents/{adwId}/orchestrator/classifier/`
- Update context with branchName after branch creation
- Pass state context to plan agent:
  - State path: `agents/{adwId}/orchestrator/plan-agent/`
  - Include issueType and planFile in state
- Pass state context to build agent:
  - State path: `agents/{adwId}/orchestrator/build-agent/`
- Update state after each major workflow step
- Read from state when recovering instead of parsing GitHub comments alone

### Step 8: Update adwPrReview.tsx Orchestrator
- Initialize orchestrator state for PR review workflow
- Pass state context to pr-review-plan-agent
- Pass state context to pr-review-build-agent
- Write final state on completion

### Step 9: Update planAgent.ts
- Accept state context parameter
- Read parent orchestrator state if available
- Use state values over derived values (issueNumber, branchName)
- Write plan file path to state after plan creation
- Store plan summary in state

### Step 10: Update buildAgent.ts
- Accept state context parameter
- Read plan file path from state instead of constructing it
- Read issueType from state for commit messages
- Write implementation summary to state

### Step 11: Create Unit Tests
- Create `adws/__tests__/agentState.test.ts`
- Test `initializeState` creates correct directory structure
- Test `writeState` and `readState` round-trip
- Test `appendLog` creates and appends correctly
- Test `writeRawOutput` for JSON and JSONL files
- Test `readParentState` traverses correctly
- Test nested agent state directories

### Step 12: Run Validation Commands
- Run all validation commands to ensure the implementation is correct with zero regressions

## Testing Strategy

### Unit Tests
- Test `AgentStateManager.initializeState` creates directories correctly
- Test `AgentStateManager.writeState` serializes state properly
- Test `AgentStateManager.readState` deserializes state properly
- Test `AgentStateManager.appendLog` handles first entry and subsequent entries
- Test `AgentStateManager.writeRawOutput` for different data types
- Test `AgentStateManager.readParentState` with nested directories
- Test state directory path generation for various scenarios
- Test error handling for missing directories and invalid state

### Integration Tests
- Test full workflow writes correct state at each stage
- Test recovery reads state correctly
- Test nested agent state (orchestrator → plan-agent → sub-agent if applicable)

### Edge Cases
- Empty or missing state files
- Concurrent writes to the same state file
- Very long log messages
- Invalid JSON in state files
- Missing parent state when reading
- Recovery from partial state
- State directory already exists from previous run

## Acceptance Criteria
- [ ] `/agents` directory is added to `.gitignore`
- [ ] Each ADW session creates a state directory under `agents/{adwId}/`
- [ ] Orchestrator state is stored in `agents/{adwId}/orchestrator/`
- [ ] Each agent has its own subdirectory with `state.json` and `execution.log`
- [ ] `state.json` contains at minimum: adwId, issueNumber, branchName, planFile, issueClass
- [ ] `execution.log` contains the prompt and timestamped log entries
- [ ] Raw JSONL output is stored alongside state files
- [ ] Nested agent calls create nested state directories
- [ ] Agents read shared context from parent state when available
- [ ] All existing tests pass
- [ ] Lint and build pass without errors
- [ ] Manual verification: run `npx tsx adws/adwPlanBuild.tsx <issue-number>` and verify state files are created

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions
- `ls -la agents/` - Verify agents directory structure exists after a test run
- `cat agents/<adw-id>/orchestrator/state.json` - Verify orchestrator state contains required fields
- `cat agents/<adw-id>/orchestrator/classifier/execution.log` - Verify execution log has prompt and entries
- `cat agents/<adw-id>/orchestrator/plan-agent/state.json` - Verify plan agent state has planFile
- `cat agents/<adw-id>/orchestrator/build-agent/state.json` - Verify build agent state is populated

## Notes

### Directory Structure Example
After a complete ADW workflow, the state directory should look like:
```
agents/
└── adw-1234567890-abc123/
    └── orchestrator/
        ├── state.json              # {adwId, issueNumber, branchName, planFile, issueClass}
        ├── execution.log           # Orchestrator logs
        ├── classifier/
        │   ├── state.json          # Classifier-specific state
        │   ├── execution.log       # Classification prompt and logs
        │   └── output.jsonl        # Raw classifier output
        ├── plan-agent/
        │   ├── state.json          # Plan agent state with planFile
        │   ├── execution.log       # Plan agent prompt and logs
        │   └── output.jsonl        # Raw plan agent output
        └── build-agent/
            ├── state.json          # Build agent state
            ├── execution.log       # Build agent prompt and logs
            └── output.jsonl        # Raw build agent output
```

### State File Schema (state.json)
```json
{
  "adwId": "adw-1234567890-abc123",
  "issueNumber": 24,
  "branchName": "feature/issue-24-add-state-to-adw",
  "planFile": "specs/issue-24-plan.md",
  "issueClass": "/feature",
  "status": "completed",
  "startedAt": "2026-02-02T12:30:00Z",
  "completedAt": "2026-02-02T12:35:00Z",
  "agentName": "plan-agent",
  "parentAgent": "orchestrator",
  "output": "Plan created successfully..."
}
```

### Backwards Compatibility
- Existing JSONL logs in `/logs/` will continue to work
- GitHub comments remain the primary UI for workflow progress
- State files provide additional debugging and recovery capabilities

### Future Considerations
- Add state cleanup utility to remove old state directories
- Consider state compression for long-running agents
- Add state visualization endpoint to the Next.js app
- Implement state-based recovery as an alternative to GitHub comment parsing
