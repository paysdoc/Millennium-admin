#!/usr/bin/env npx tsx
/**
 * ADW Clear Comments Script
 *
 * Removes all comments from a specified GitHub issue.
 * Useful for resetting an issue's comment history after a failed ADW workflow run.
 *
 * Usage: npx tsx adws/adwClearComments.tsx <issue_number> [--dry-run]
 *
 * Options:
 *   --dry-run  Preview which comments would be deleted without actually deleting them
 */

import { log } from './core';
import { fetchIssueCommentsRest, deleteIssueComment } from './github';
import { IssueCommentSummary } from './core';

/** Result summary for the clear comments operation. */
export interface ClearCommentsResult {
  total: number;
  deleted: number;
  failed: number;
}

/** Parsed CLI arguments. */
interface ParsedArgs {
  issueNumber: number;
  dryRun: boolean;
}

const MAX_BODY_PREVIEW = 80;

/**
 * Prints usage information and exits with code 1.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwClearComments.tsx <issue_number> [--dry-run]');
  console.error('');
  console.error('Removes all comments from a specified GitHub issue.');
  console.error('');
  console.error('Arguments:');
  console.error('  issue_number  - GitHub issue number (required)');
  console.error('');
  console.error('Options:');
  console.error('  --dry-run     - Preview comments without deleting them');
  process.exit(1);
}

/**
 * Parses CLI arguments into structured form.
 */
export function parseArguments(args: string[]): ParsedArgs {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));

  if (positional.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(positional[0], 10);
  if (isNaN(issueNumber) || issueNumber <= 0) {
    console.error(`Invalid issue number: ${positional[0]}`);
    process.exit(1);
  }

  return { issueNumber, dryRun };
}

/**
 * Truncates a string to a maximum length, appending "..." if truncated.
 */
function truncateBody(body: string): string {
  const singleLine = body.replace(/\n/g, ' ').trim();
  return singleLine.length > MAX_BODY_PREVIEW
    ? `${singleLine.substring(0, MAX_BODY_PREVIEW)}...`
    : singleLine;
}

/**
 * Logs a single comment preview line.
 */
function logCommentPreview(index: number, total: number, comment: IssueCommentSummary): void {
  log(`  [${index + 1}/${total}] by ${comment.authorLogin} on ${comment.createdAt}: ${truncateBody(comment.body)}`);
}

/**
 * Clears all comments from a GitHub issue.
 * In dry-run mode, lists comments without deleting them.
 */
export function clearIssueComments(issueNumber: number, dryRun: boolean): ClearCommentsResult {
  const comments = fetchIssueCommentsRest(issueNumber);

  if (comments.length === 0) {
    log('No comments found on this issue.');
    return { total: 0, deleted: 0, failed: 0 };
  }

  log(`Found ${comments.length} comment(s) on issue #${issueNumber}`);

  if (dryRun) {
    log('DRY RUN - the following comments would be deleted:');
    comments.forEach((comment, i) => logCommentPreview(i, comments.length, comment));
    return { total: comments.length, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  comments.forEach((comment, i) => {
    log(`Deleting comment ${i + 1}/${comments.length} by ${comment.authorLogin}...`);
    const success = deleteIssueComment(comment.id);
    if (success) {
      deleted++;
    } else {
      failed++;
    }
  });

  return { total: comments.length, deleted, failed };
}

/**
 * Main entry point for the clear comments script.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, dryRun } = parseArguments(args);

  log(`ADW Clear Comments - Issue #${issueNumber}${dryRun ? ' (DRY RUN)' : ''}`);

  const result = clearIssueComments(issueNumber, dryRun);

  log(`Summary: ${result.total} total, ${result.deleted} deleted, ${result.failed} failed`);

  process.exit(result.failed > 0 ? 1 : 0);
}

// Guard: only run main() when executed directly, not when imported in tests
const isDirectExecution = process.argv[1]?.includes('adwClearComments');
if (isDirectExecution) {
  main();
}
