#!/usr/bin/env npx tsx
/**
 * ADW PR Review - AI Developer Workflow for PR Review Comments
 *
 * Usage: npx tsx adws/adwPrReview.tsx <pr-number>
 *
 * Workflow:
 * 1. Fetch PR details and review comments
 * 2. Detect unaddressed review comments
 * 3. Run Plan Agent to create revision plan
 * 4. Run Build Agent to implement changes
 * 5. Commit and push to the PR branch
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 */

import * as fs from 'fs';
import { log, generateAdwId, ensureLogsDirectory, commitPrefixMap } from './core';
import {
  fetchPRDetails,
  checkoutBranch,
  commitChanges,
  pushBranch,
  postPRWorkflowComment,
  PRReviewWorkflowContext,
  getUnaddressedComments,
  inferIssueTypeFromBranch,
} from './github';
import {
  runPrReviewPlanAgent,
  getPlanFilePath,
  runPrReviewBuildAgent,
  ProgressCallback,
  ProgressInfo,
} from './agents';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx tsx adws/adwPrReview.tsx <pr-number>');
    process.exit(1);
  }

  const prNumber = parseInt(args[0], 10);
  if (isNaN(prNumber)) {
    console.error(`Invalid PR number: ${args[0]}`);
    process.exit(1);
  }

  log(`Starting ADW PR Review workflow for PR #${prNumber}`, 'info');

  // Step 1: Fetch PR details
  const prDetails = fetchPRDetails(prNumber);
  log(`Fetched PR: ${prDetails.title}`, 'success');

  // Exit early if PR is closed or merged
  if (prDetails.state === 'CLOSED' || prDetails.state === 'MERGED') {
    log(`PR #${prNumber} is ${prDetails.state}, skipping`, 'info');
    return;
  }

  // Step 2: Detect unaddressed review comments
  const unaddressedComments = getUnaddressedComments(prNumber);

  if (unaddressedComments.length === 0) {
    log(`No unaddressed review comments on PR #${prNumber}, exiting`, 'info');
    return;
  }

  log(`Found ${unaddressedComments.length} unaddressed review comment(s)`, 'info');

  // Step 3: Generate ADW ID and create logs directory
  const adwId = generateAdwId();
  const logsDir = ensureLogsDirectory(adwId);
  log(`ADW ID: ${adwId}`, 'info');

  const issueNumber = prDetails.issueNumber;

  const ctx: PRReviewWorkflowContext = {
    issueNumber: issueNumber || 0,
    adwId,
    prNumber,
    reviewComments: unaddressedComments.length,
    branchName: prDetails.headBranch,
  };

  // Step 4: Post starting comment on PR
  postPRWorkflowComment(prNumber, 'pr_review_starting', ctx);

  try {
    // Step 5: Checkout the PR's head branch
    checkoutBranch(prDetails.headBranch);

    // Step 6: Read existing plan file
    let existingPlanContent = '';
    if (issueNumber) {
      const planPath = getPlanFilePath(issueNumber);
      try {
        existingPlanContent = fs.readFileSync(planPath, 'utf-8');
        log(`Read existing plan from ${planPath}`, 'success');
      } catch {
        log(`No existing plan file found at ${planPath}, using PR body as context`, 'info');
        existingPlanContent = prDetails.body;
      }
    } else {
      log('No issue number found in PR body, using PR body as context', 'info');
      existingPlanContent = prDetails.body;
    }

    // Step 7: Run PR Review Plan Agent
    postPRWorkflowComment(prNumber, 'pr_review_planning', ctx);
    log('Running PR Review Plan Agent...', 'info');

    const planResult = await runPrReviewPlanAgent(
      prDetails,
      unaddressedComments,
      existingPlanContent,
      logsDir
    );

    if (!planResult.success) {
      throw new Error(`PR Review Plan Agent failed: ${planResult.output}`);
    }

    ctx.revisionPlanOutput = planResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_planned', ctx);

    // Step 8: Run PR Review Build Agent
    postPRWorkflowComment(prNumber, 'pr_review_implementing', ctx);
    log('Running PR Review Build Agent...', 'info');

    const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
      if (info.type === 'tool_use') {
        log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
      }
    };

    const buildResult = await runPrReviewBuildAgent(
      prDetails,
      unaddressedComments,
      planResult.output,
      logsDir,
      buildProgressCallback
    );

    if (!buildResult.success) {
      throw new Error(`PR Review Build Agent failed: ${buildResult.output}`);
    }

    ctx.revisionBuildOutput = buildResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_implemented', ctx);

    // Step 9: Commit changes with correct prefix based on branch type
    postPRWorkflowComment(prNumber, 'pr_review_committing', ctx);
    const issueType = inferIssueTypeFromBranch(prDetails.headBranch);
    const commitPrefix = commitPrefixMap[issueType];
    const commitMsg = issueNumber
      ? `${commitPrefix} address PR review comments for #${issueNumber}`
      : `${commitPrefix} address PR review comments`;
    commitChanges(commitMsg);

    // Step 10: Push to the PR branch
    pushBranch(prDetails.headBranch);
    postPRWorkflowComment(prNumber, 'pr_review_pushed', ctx);

    // Step 11: Post completed comment
    postPRWorkflowComment(prNumber, 'pr_review_completed', ctx);

    log('ADW PR Review workflow completed!', 'success');
    log(`PR: ${prDetails.url}`, 'info');
    log(`Comments addressed: ${unaddressedComments.length}`, 'info');

  } catch (error) {
    ctx.errorMessage = String(error);
    postPRWorkflowComment(prNumber, 'pr_review_error', ctx);
    log(`PR Review workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
