#!/usr/bin/env npx tsx
/**
 * ADW Clear Comments Script
 *
 * Removes all comments from a GitHub issue.
 * Useful for resetting an issue when a workflow has gone wrong.
 *
 * Usage: npx tsx adws/adwClearComments.tsx <issue_number>
 */

import { log, parseClearCommentsArguments } from './core';
import { fetchIssueCommentsRest, deleteIssueComment } from './github';

interface ClearCommentsResult {
  total: number;
  deleted: number;
  failed: number;
}

/**
 * Attempt to delete a single comment, returning success status.
 */
const tryDeleteComment = (commentId: number): boolean => {
  try {
    deleteIssueComment(commentId);
    return true;
  } catch (error) {
    log(`Failed to delete comment ${commentId}: ${error}`, 'error');
    return false;
  }
};

/**
 * Fetches all comments on an issue and deletes them sequentially.
 * Continues deleting even if individual deletions fail.
 */
export const clearIssueComments = (issueNumber: number): ClearCommentsResult => {
  const comments = fetchIssueCommentsRest(issueNumber);

  if (comments.length === 0) {
    log(`No comments found on issue #${issueNumber}`, 'info');
    return { total: 0, deleted: 0, failed: 0 };
  }

  log(`Found ${comments.length} comment(s) on issue #${issueNumber}`, 'info');

  // Count successes/failures using filter instead of mutable counters
  const deleted = comments.filter((comment) => tryDeleteComment(comment.id)).length;

  return { total: comments.length, deleted, failed: comments.length - deleted };
};

/**
 * Main entry point.
 */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const { issueNumber } = parseClearCommentsArguments(args, 'adwClearComments.tsx');

  log(`Clearing all comments from issue #${issueNumber}...`, 'info');

  const result = clearIssueComments(issueNumber);

  log(`Summary: ${result.deleted}/${result.total} deleted, ${result.failed} failed`, 'info');

  process.exit(result.failed > 0 ? 1 : 0);
};

const isDirectExecution = process.argv[1]?.includes('adwClearComments');
if (isDirectExecution) {
  main();
}
