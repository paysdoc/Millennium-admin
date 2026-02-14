/**
 * Workflow-related types and constants for ADW orchestration.
 */

/**
 * Supported slash commands for issue classification.
 * These should align with your custom slash commands in .claude/commands that you want to run.
 */
export type IssueClassSlashCommand = '/chore' | '/bug' | '/feature' | '/pr_review';

/**
 * Valid ADW workflow slash commands for explicit workflow routing.
 */
export type AdwSlashCommand =
  | '/adw_plan'
  | '/adw_build'
  | '/adw_test'
  | '/adw_review'
  | '/adw_document'
  | '/adw_patch'
  | '/adw_plan_build'
  | '/adw_plan_build_test'
  | '/adw_plan_build_review'
  | '/adw_plan_build_document'
  | '/adw_plan_build_test_review'
  | '/adw_sdlc';

/**
 * All slash commands used in the ADW system.
 * Includes issue classification commands and ADW-specific commands.
 */
export type SlashCommand =
  // Issue classification commands
  | '/chore'
  | '/bug'
  | '/feature'
  | '/pr_review'
  // ADW workflow commands
  | '/classify_adw'
  | '/classify_issue'
  | '/find_plan_file'
  | '/generate_branch_name'
  | '/commit'
  | '/pull_request'
  | '/implement';

/**
 * Workflow stages for ADW progress tracking.
 */
export type WorkflowStage =
  | 'starting'
  | 'resuming'
  | 'classified'
  | 'branch_created'
  | 'plan_building'
  | 'plan_created'
  | 'plan_file_created'
  | 'plan_committing'
  | 'implementing'
  | 'build_progress'
  | 'implemented'
  | 'implementation_committing'
  | 'pr_creating'
  | 'pr_created'
  | 'completed'
  | 'error'
  // Test workflow stages
  | 'test_running'
  | 'test_failed'
  | 'test_resolving'
  | 'test_passed'
  // Review workflow stages
  | 'review_running'
  | 'review_passed'
  | 'review_failed'
  | 'review_patching';

/**
 * Workflow stages for PR review progress tracking.
 */
export type PRReviewWorkflowStage =
  | 'pr_review_starting'
  | 'pr_review_planning'
  | 'pr_review_planned'
  | 'pr_review_implementing'
  | 'pr_review_implemented'
  | 'pr_review_testing'
  | 'pr_review_test_failed'
  | 'pr_review_test_passed'
  | 'pr_review_test_max_attempts'
  | 'pr_review_committing'
  | 'pr_review_pushed'
  | 'pr_review_completed'
  | 'pr_review_error';

/**
 * Result from the /classify_adw command extraction.
 */
export interface AdwClassificationResult {
  adw_slash_command?: AdwSlashCommand;
  adw_id?: string;
}

/**
 * Maps ADW workflow commands to issue classification types.
 * Commands with test phases map to /feature, without test to /bug,
 * planning/documentation-only to /chore, review-focused to /pr_review.
 */
export const adwCommandToIssueTypeMap: Record<AdwSlashCommand, IssueClassSlashCommand> = {
  '/adw_plan': '/chore',
  '/adw_build': '/feature',
  '/adw_test': '/feature',
  '/adw_review': '/pr_review',
  '/adw_document': '/chore',
  '/adw_patch': '/bug',
  '/adw_plan_build': '/bug',
  '/adw_plan_build_test': '/feature',
  '/adw_plan_build_review': '/pr_review',
  '/adw_plan_build_document': '/chore',
  '/adw_plan_build_test_review': '/feature',
  '/adw_sdlc': '/feature',
};

/**
 * Maps ADW workflow commands to their dedicated orchestrator scripts.
 * Commands present in this map bypass issue-type-based routing and route
 * directly to the specified orchestrator. Commands omitted from this map
 * (e.g., `/adw_review`, `/adw_document`, `/adw_patch`) fall back to
 * issue-type-based routing in `getWorkflowScript()`.
 */
export const adwCommandToOrchestratorMap: Partial<Record<AdwSlashCommand, string>> = {
  '/adw_plan': 'adws/adwPlan.tsx',
  '/adw_build': 'adws/adwBuild.tsx',
  '/adw_test': 'adws/adwTest.tsx',
  '/adw_plan_build': 'adws/adwPlanBuild.tsx',
  '/adw_plan_build_test': 'adws/adwPlanBuildTest.tsx',
  '/adw_plan_build_test_review': 'adws/adwPlanBuildTestReview.tsx',
  '/adw_sdlc': 'adws/adwPlanBuildTestReview.tsx',
} as const;
