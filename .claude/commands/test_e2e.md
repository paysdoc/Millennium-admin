# E2E Test Runner

Execute end-to-end (E2E) tests using Playwright browser automation (MCP Server). If any errors occur and assertions fail mark the test as failed and explain exactly what went wrong.

## Variables

adwId: $1 if provided, otherwise generate a random 8 character hex string
agentName: $2 if provided, otherwise use 'testE2e'
e2e_test_file: $3
applicationUrl: $4 if provided, otherwise use http://localhost:3000

## Instructions

- Read the `e2e_test_file`
- Digest the `User Story` to first understand what we're validating
- IMPORTANT: Execute the `Test Steps` detailed in the `e2e_test_file` using Playwright browser automation
- Review the `Success Criteria` and if any of them fail, mark the test as failed and explain exactly what went wrong
- Review the steps that say '**Verify**...' and if they fail, mark the test as failed and explain exactly what went wrong
- Capture screenshots as specified
- IMPORTANT: Return results in the format requested by the `Output Format`
- Initialize Playwright browser in headed mode for visibility
- Use the `applicationUrl`
- Allow time for async operations and element visibility
- IMPORTANT: After taking each screenshot, save it to `Screenshot Directory` with descriptive names. Use absolute paths to move the files to the `Screenshot Directory` with the correct name.
- Log the progress of each step to the console
- Capture and report any errors encountered
- Ultra think about the `Test Steps` and execute them in order
- If you encounter an error, mark the test as failed immediately and explain exactly what went wrong and on what step it occurred. For example: '(Step 1 ❌) Failed to find element with selector "queryInput" on page `application_url`'
- Use `pwd` or equivalent to get the absolute path to the codebase for writing and displaying the correct paths to the screenshots

## Setup

Extract the port number from the `applicationUrl` (e.g. if applicationUrl is `http://localhost:12345`, the port is `12345`).
Read and Execute `.claude/commands/prepare_app.md` with the extracted port number to prepare the application for the test.

## Screenshot Directory

<absolute path to codebase>/agents/<adwId>/<agentName>/img/<directory name based on test file name>/*.png

Each screenshot should be saved with a descriptive name that reflects what is being captured. The directory structure ensures that:
- Screenshots are organized by ADW ID (workflow run)
- They are stored under the specified agent name (e.g., e2eTest_runner_0, e2eTest_resolverIter1_0)
- Each test has its own subdirectory based on the test file name (e.g., test_basic_query → basic_query/)

## Report

- Exclusively return the JSON output as specified in the test file
- Capture any unexpected errors
- IMPORTANT: Ensure all screenshots are saved in the `Screenshot Directory`

### Output Format

```json
{
  "testName": "Test Name Here",
  "status": "passed|failed",
  "screenshots": [
    "<absolute path to codebase>/agents/<adwId>/<agentName>/img/<test name>/01_<descriptive name>.png",
    "<absolute path to codebase>/agents/<adwId>/<agentName>/img/<test name>/02_<descriptive name>.png",
    "<absolute path to codebase>/agents/<adwId>/<agentName>/img/<test name>/03_<descriptive name>.png"
  ],
  "error": null
}
```