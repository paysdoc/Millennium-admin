/**
 * PR Comment Detector - Detects unaddressed PR review comments.
 *
 * Compares PR review comment timestamps against the last ADW commit
 * on the branch to determine which comments still need to be addressed.
 */

import { execSync } from 'child_process';
import { PRReviewComment } from './dataTypes';
import { fetchPRDetails, fetchPRReviewComments } from './githubApi';
import { log } from './utils';

/**
 * Gets the timestamp of the last ADW commit on the given branch.
 * Looks for commits matching ADW patterns like "feat: implement #" or "feat: address PR review".
 * Returns null if no ADW commits are found.
 */
export function getLastAdwCommitTimestamp(branchName: string): Date | null {
  try {
    // Get commits on the branch that match ADW commit message patterns
    const output = execSync(
      `git log ${branchName} --format="%aI %s" --no-merges`,
      { encoding: 'utf-8' }
    );

    const adwPatterns = [
      /feat: implement #/,
      /feat: address PR review/,
      /feat: add implementation plan for #/,
    ];

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const timestamp = line.substring(0, spaceIdx);
      const message = line.substring(spaceIdx + 1);

      if (adwPatterns.some(p => p.test(message))) {
        return new Date(timestamp);
      }
    }

    return null;
  } catch (error) {
    log(`Failed to get last ADW commit timestamp: ${error}`, 'error');
    return null;
  }
}

/**
 * Gets unaddressed PR review comments — comments posted after the last ADW commit.
 * If no ADW commits are found, all non-bot comments are considered unaddressed.
 */
export function getUnaddressedComments(prNumber: number): PRReviewComment[] {
  const prDetails = fetchPRDetails(prNumber);
  const comments = fetchPRReviewComments(prNumber);

  // Filter out bot comments
  const humanComments = comments.filter(c => !c.author.isBot);

  if (humanComments.length === 0) {
    return [];
  }

  const lastAdwCommit = getLastAdwCommitTimestamp(prDetails.headBranch);

  if (!lastAdwCommit) {
    // No ADW commits found — treat all human comments as unaddressed
    return humanComments;
  }

  // Return comments created after the last ADW commit
  return humanComments.filter(c => new Date(c.createdAt) > lastAdwCommit);
}

/**
 * Returns true if the PR has any unaddressed review comments.
 */
export function hasUnaddressedComments(prNumber: number): boolean {
  return getUnaddressedComments(prNumber).length > 0;
}
