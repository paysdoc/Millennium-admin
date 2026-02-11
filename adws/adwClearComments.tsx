#!/usr/bin/env npx tsx
/**
 * Standalone ADW script to clear all comments from a GitHub issue.
 *
 * Usage: npx tsx adws/adwClearComments.tsx <issue_number> [--adw-only]
 */

import { log } from './core';
import { getRepoInfo, fetchIssueCommentsRest, deleteIssueComment } from './github';
import { isAdwComment } from './github/workflowCommentsBase';

interface ClearResult {
  readonly total: number;
  readonly deleted: number;
  readonly failed: number;
}

function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwClearComments.tsx <issue_number> [--adw-only]');
  console.error('');
  console.error('Arguments:');
  console.error('  issue_number  - GitHub issue number');
  console.error('  --adw-only    - Only delete ADW bot comments');
  process.exit(1);
}

function parseArguments(args: readonly string[]): { issueNumber: number; adwOnly: boolean } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber) || issueNumber <= 0) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const adwOnly = args.includes('--adw-only');
  return { issueNumber, adwOnly };
}

/**
 * Clears comments from a GitHub issue.
 * When adwOnly is true, only comments matching the ADW bot pattern are deleted.
 */
export function clearIssueComments(issueNumber: number, adwOnly: boolean): ClearResult {
  const { owner, repo } = getRepoInfo();
  const allComments = fetchIssueCommentsRest(owner, repo, issueNumber);

  const targetComments = adwOnly
    ? allComments.filter((c) => isAdwComment(c.body))
    : allComments;

  log(`Issue #${issueNumber}: ${allComments.length} total comments, ${targetComments.length} to delete`);

  if (targetComments.length === 0) {
    log('No comments to delete', 'info');
    return { total: 0, deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  targetComments.forEach((comment, index) => {
    try {
      log(`Deleting comment ${index + 1}/${targetComments.length} (id: ${comment.id})...`);
      deleteIssueComment(owner, repo, comment.id);
      deleted++;
    } catch (error) {
      log(`Failed to delete comment ${comment.id}: ${error}`, 'error');
      failed++;
    }
  });

  log(`Done: ${deleted} deleted, ${failed} failed`, deleted > 0 ? 'success' : 'error');
  return { total: targetComments.length, deleted, failed };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, adwOnly } = parseArguments(args);

  log(`Clearing ${adwOnly ? 'ADW' : 'all'} comments on issue #${issueNumber}...`);
  const result = clearIssueComments(issueNumber, adwOnly);

  console.log(JSON.stringify(result));
  process.exit(result.failed > 0 && result.deleted === 0 ? 1 : 0);
}

const isDirectExecution = process.argv[1]?.includes('adwClearComments');
if (isDirectExecution) {
  main();
}
