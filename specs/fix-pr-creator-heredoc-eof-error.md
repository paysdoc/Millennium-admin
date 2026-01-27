# Bug: PR Creator Heredoc EOF Parsing Error

## Bug Description
When creating a pull request using the `createPullRequest` function in `adws/pullRequestCreator.ts`, the bash command fails with an EOF parsing error:

```
Error when creating a pull request: EOF
)" --base develop
/bin/bash: -c: line 8: unexpected EOF while looking for matching `''
/bin/bash: -c: line 56: syntax error: unexpected end of file
```

The PR creation fails completely, and no pull request is created. The expected behavior is that the PR should be created successfully with the generated body content.

## Problem Statement
The `createPullRequest` function uses a bash heredoc (`<<'EOF'`) embedded within a command substitution (`$(...)`) to pass the PR body to `gh pr create --body`. This approach is fragile because:

1. If the PR body content contains the literal string `EOF` on its own line, it prematurely terminates the heredoc
2. The nested quoting context (double quotes around `$(...)`, plus heredoc with single-quoted delimiter) can cause shell parsing issues
3. Complex content with special characters can interfere with bash's parsing of the multi-line command

## Solution Statement
Replace the fragile heredoc-based approach with a file-based approach that avoids shell parsing issues entirely:

1. Write the PR body content to a temporary file
2. Use `gh pr create --body-file <tempfile>` to read the body from the file
3. Clean up the temporary file after the command completes

This approach completely isolates the PR body content from shell parsing, eliminating all quoting and heredoc-related issues.

## Steps to Reproduce
1. Run the ADW Plan & Build workflow on an issue
2. Let the workflow complete the planning and building phases
3. When the workflow attempts to create a PR with `createPullRequest()`, the bash heredoc parsing fails
4. The error message shows "unexpected EOF while looking for matching" with a syntax error

## Root Cause Analysis
The root cause is the use of bash heredoc syntax within a command substitution inside a shell command string. The current implementation at `adws/pullRequestCreator.ts:62-68`:

```typescript
const prUrl = execSync(
  `gh pr create --title "${prTitle.replace(/"/g, '\\"')}" --body "$(cat <<'EOF'
${prBody}
EOF
)" --base ${baseBranch}`,
  { encoding: 'utf-8', shell: '/bin/bash' }
).trim();
```

This construction has multiple nested quoting contexts:
- Outer template literal (backticks)
- Double quotes around the body value
- Command substitution `$(...)`
- Heredoc with quoted delimiter `<<'EOF'`

When the `prBody` variable contains content that interferes with any of these layers (such as unbalanced quotes, the string `EOF`, or certain escape sequences), bash's parser becomes confused and fails.

The error "unexpected EOF while looking for matching `'" indicates bash found what it thought was the start of a single-quoted string but never found the closing quote before reaching the end of input.

## Relevant Files
Use these files to fix the bug:

- `adws/pullRequestCreator.ts` - Contains the `createPullRequest` function with the faulty heredoc implementation. This is the primary file that needs modification.

## Step by Step Tasks

### 1. Add fs and os imports to pullRequestCreator.ts
- Add import for `fs` module (writeFileSync, unlinkSync, mkdtempSync) at the top of the file
- Add import for `os` module (tmpdir) for cross-platform temp directory access
- Add import for `path` module (join) for path construction

### 2. Refactor createPullRequest to use file-based body passing
- Create a temporary directory using `mkdtempSync(path.join(os.tmpdir(), 'adw-pr-'))`
- Write the PR body content to a temporary file within this directory
- Replace the heredoc-based `--body` argument with `--body-file <tempfile>`
- Wrap the command execution in a try-finally block to ensure cleanup
- Delete the temporary file and directory in the finally block using `unlinkSync` and `rmdirSync`

### 3. Update the gh pr create command structure
- Remove the heredoc syntax entirely: `$(cat <<'EOF'...EOF)`
- Use simple string interpolation for title: `--title "${escapedTitle}"`
- Add `--body-file ${tempFilePath}` for the body content
- Keep the `--base ${baseBranch}` argument unchanged

### 4. Run validation commands
- Execute `npm run lint` to verify no linting errors
- Execute `npm run build` to verify the TypeScript compiles correctly
- Execute `npm test` to run tests and verify no regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions
- `npx ts-node -e "import { createPullRequest } from './adws/pullRequestCreator'; console.log('Module loads successfully');"` - Verify the module can be imported without errors

## Notes
- The `gh` CLI supports `--body-file` which reads the PR body from a file, making it the ideal solution for this problem
- Using a temporary file is a standard pattern for passing large or complex content to CLI tools
- The cleanup in the finally block ensures no temporary files are left behind even if the command fails
- This fix also makes the code more maintainable as there are no complex nested quoting contexts to reason about
