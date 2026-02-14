/**
 * Composable workflow phase functions for orchestrators.
 *
 * This barrel file re-exports all phase modules for backward compatibility.
 * Each phase is implemented in its own module under ./phases/.
 *
 * Located at adws/ level (not in core/) because it imports from
 * agents/, github/, triggers/, and core/.
 */

// Shared types
export type { WorkflowConfig, PRReviewWorkflowConfig } from './phases/phaseUtils';

// Initialization phases
export { initializeWorkflow } from './phases/initPhase';
export { initializePRReviewWorkflow } from './phases/initPRReviewPhase';

// Plan phases
export { executePlanPhase } from './phases/planPhase';
export { executePRReviewPlanPhase } from './phases/planPRReviewPhase';

// Build phases
export { executeBuildPhase } from './phases/buildPhase';
export { executePRReviewBuildPhase } from './phases/buildPRReviewPhase';

// Test phases
export { executeTestPhase } from './phases/testPhase';
export { executePRReviewTestPhase } from './phases/testPRReviewPhase';

// Review phase
export { executeReviewPhase } from './phases/reviewPhase';

// PR creation phase
export { executePRPhase } from './phases/prPhase';

// Completion and error handling
export {
  completeWorkflow,
  handleWorkflowError,
  completePRReviewWorkflow,
  handlePRReviewWorkflowError,
} from './phases/completionPhase';
