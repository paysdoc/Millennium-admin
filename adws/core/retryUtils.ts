/**
 * Functional retry utilities using recursion instead of loops.
 * Provides a generic retry abstraction for test and review retry workflows.
 */

import type { ModelUsageMap } from './costTypes';
import { emptyModelUsageMap } from './costTypes';
import { mergeModelUsageMaps } from './costReport';

/** Accumulated costs and model usage across retry attempts. */
export interface RetryCost {
  readonly costUsd: number;
  readonly modelUsage: ModelUsageMap;
}

/** Creates a zero-valued RetryCost. */
export const emptyRetryCost = (): RetryCost => ({
  costUsd: 0,
  modelUsage: emptyModelUsageMap(),
});

/** Immutably merges an additional cost into an existing RetryCost. */
export const addCost = (
  acc: RetryCost,
  costUsd: number,
  modelUsage?: ModelUsageMap,
): RetryCost => ({
  costUsd: acc.costUsd + costUsd,
  modelUsage: modelUsage
    ? mergeModelUsageMaps(acc.modelUsage, modelUsage)
    : acc.modelUsage,
});

/** Options for the recursive retry function. */
export interface RetryOptions {
  readonly maxRetries: number;
  readonly onAttempt?: (attempt: number) => void;
  readonly onFailure?: (attempt: number, error: unknown) => void;
}

/**
 * Outcome of a single retry attempt, indicating whether to continue retrying.
 * - `done: true` means the operation succeeded and retrying should stop.
 * - `done: false` means the operation failed and should be retried (if attempts remain).
 */
export type RetryAttemptResult<T> =
  | { readonly done: true; readonly value: T }
  | { readonly done: false; readonly value: T };

/**
 * A recursive retry function that avoids mutable counters and while loops.
 *
 * Calls `fn` on each attempt. The function returns a `RetryAttemptResult`
 * indicating whether to stop (`done: true`) or keep retrying (`done: false`).
 * Recursion terminates when `done` is true or `maxRetries` is exhausted.
 *
 * @param fn - The function to execute on each attempt (receives the current attempt number, 0-based)
 * @param options - Retry configuration
 * @param attempt - Current attempt number (used internally for recursion)
 * @returns The final result and the number of attempts made
 */
export const retryRecursive = async <T>(
  fn: (attempt: number) => Promise<RetryAttemptResult<T>>,
  options: RetryOptions,
  attempt: number = 0,
): Promise<{ readonly result: T; readonly attempts: number }> => {
  options.onAttempt?.(attempt);

  const outcome = await fn(attempt);

  if (outcome.done || attempt + 1 >= options.maxRetries) {
    return { result: outcome.value, attempts: attempt + 1 };
  }

  options.onFailure?.(attempt, outcome.value);

  return retryRecursive(fn, options, attempt + 1);
};

/**
 * Sequentially processes an array using an async reducer (no for loops).
 * Returns the accumulated result after processing every element.
 *
 * @param items - Array of items to process
 * @param reducer - Async function that processes each item and returns updated accumulator
 * @param initial - Initial accumulator value
 */
export const reduceAsync = async <T, A>(
  items: readonly T[],
  reducer: (acc: A, item: T, index: number) => Promise<A>,
  initial: A,
): Promise<A> =>
  items.reduce<Promise<A>>(
    async (accPromise, item, index) => reducer(await accPromise, item, index),
    Promise.resolve(initial),
  );
