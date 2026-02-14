/**
 * Shared CLI argument parsing utilities for ADW orchestrator scripts.
 *
 * All functions use immutable array operations (no splice/mutation).
 * All function declarations use const arrow syntax.
 */

/**
 * Prints usage information to stderr and exits with code 1.
 */
export const printUsageAndExit = (scriptName: string, description: string, options?: string): never => {
  console.error(`Usage: npx tsx adws/${scriptName} ${description}`);
  if (options) {
    console.error('');
    console.error(options);
  }
  process.exit(1);
};

/**
 * Extracts a named --flag <value> pair from args without mutating the original array.
 * Returns the extracted value and the remaining args with the flag+value removed.
 */
const extractOption = (
  args: readonly string[],
  flag: string
): { value: string | null; remaining: readonly string[] } => {
  const idx = args.indexOf(flag);
  if (idx === -1 || !args[idx + 1]) {
    return { value: null, remaining: args };
  }
  const value = args[idx + 1];
  const remaining = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { value, remaining };
};

/**
 * Parses an issue number from the first positional arg. Exits on failure.
 */
const parseIssueNumber = (arg: string | undefined, scriptName: string): number => {
  if (arg === undefined) {
    return printUsageAndExit(scriptName, '<github-issue-number> ...');
  }
  const n = parseInt(arg, 10);
  if (isNaN(n)) {
    console.error(`Invalid issue number: ${arg}`);
    process.exit(1);
  }
  return n;
};

/**
 * Standard CLI parser for orchestrators that take: <issue-number> [adw-id] [--cwd <path>]
 */
export const parseCliArguments = (
  args: readonly string[],
  scriptName: string
): { issueNumber: number; providedAdwId: string | null; cwd: string | null } => {
  if (args.length < 1) {
    printUsageAndExit(scriptName, '<github-issue-number> [adw-id] [--cwd <path>]');
  }
  const { value: cwd, remaining } = extractOption(args, '--cwd');
  const issueNumber = parseIssueNumber(remaining[0], scriptName);
  const providedAdwId = remaining[1] || null;
  return { issueNumber, providedAdwId, cwd };
};

/**
 * Extended CLI parser for adwPlan that also supports --issue-type <type>.
 */
export const parseCliArgumentsWithIssueType = (
  args: readonly string[],
  scriptName: string
): { issueNumber: number; providedAdwId: string | null; cwd: string | null; providedIssueType: string | null } => {
  if (args.length < 1) {
    printUsageAndExit(scriptName, '<github-issue-number> [adw-id] [--cwd <path>] [--issue-type <type>]');
  }
  const { value: cwd, remaining: afterCwd } = extractOption(args, '--cwd');
  const { value: issueType, remaining: afterType } = extractOption(afterCwd, '--issue-type');

  if (issueType !== null) {
    const validTypes = ['/feature', '/bug', '/chore', '/pr_review'];
    if (!validTypes.includes(issueType)) {
      console.error(`Invalid issue type: ${issueType}. Valid values: ${validTypes.join(', ')}`);
      process.exit(1);
    }
  }

  const issueNumber = parseIssueNumber(afterType[0], scriptName);
  const providedAdwId = afterType[1] || null;
  return { issueNumber, providedAdwId, cwd, providedIssueType: issueType };
};

/**
 * CLI parser for adwTest which takes: [adw-id] [--cwd <path>]
 * Does not require an issue number.
 */
export const parseTestArguments = (
  args: readonly string[],
  scriptName: string
): { adwId: string | null; cwd: string | null } => {
  if (args.includes('--help') || args.includes('-h')) {
    printUsageAndExit(scriptName, '[adw-id] [--cwd <path>]');
  }
  const { value: cwd, remaining } = extractOption(args, '--cwd');
  const adwId = remaining[0] || null;
  return { adwId, cwd };
};

/**
 * CLI parser for adwPrReview which takes: <pr-number> [adw-id]
 */
export const parsePrReviewArguments = (
  args: readonly string[],
  scriptName: string
): { prNumber: number; adwId: string | null } => {
  if (args.length < 1) {
    printUsageAndExit(scriptName, '<pr-number> [adw-id]');
  }
  const prNumber = parseInt(args[0], 10);
  if (isNaN(prNumber)) {
    console.error(`Invalid PR number: ${args[0]}`);
    process.exit(1);
  }
  const adwId = args[1] || null;
  return { prNumber, adwId };
};

/**
 * CLI parser for adwClearComments which takes: <issue-number>
 */
export const parseClearCommentsArguments = (
  args: readonly string[],
  scriptName: string
): { issueNumber: number } => {
  if (args.length < 1) {
    printUsageAndExit(scriptName, '<issue_number>');
  }
  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber) || issueNumber <= 0) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }
  return { issueNumber };
};
