/**
 * A hard ceiling on the number of model calls a run may make.
 *
 * This is a different question from the reasoning threshold, which decides
 * whether a *particular* job deserves an explanation. A threshold cannot bound
 * cost, because how many postings clear it is not known until the run is under
 * way — pointing `match` at a full catalogue is one command away from
 * thousands of calls. The budget answers "can this run still afford it".
 *
 * Reservation happens before the call, not after it succeeds: a call that
 * fails may still have been billed, so a ceiling that only counted successes
 * would not be a ceiling.
 */
export interface CallBudget {
  /** The ceiling this budget was created with. */
  readonly limit: number;
  /** How many calls have been reserved so far. */
  readonly spent: number;
  /** How many calls remain. */
  readonly remaining: number;
  /** True once nothing remains. */
  readonly exhausted: boolean;
  /**
   * Reserves one call, returning false once the ceiling is reached.
   *
   * Synchronous by design: a check-then-increment that cannot be interleaved
   * stays correct if matching is ever run concurrently.
   */
  tryConsume(): boolean;
}

export const createCallBudget = (limit: number): CallBudget => {
  if (!Number.isInteger(limit)) {
    throw new Error(`Call budget must be a whole integer, received ${limit}`);
  }
  if (limit < 0) {
    throw new Error(`Call budget must be non-negative, received ${limit}`);
  }

  let spent = 0;

  return {
    limit,
    get spent() {
      return spent;
    },
    get remaining() {
      return limit - spent;
    },
    get exhausted() {
      return spent >= limit;
    },
    tryConsume() {
      if (spent >= limit) return false;
      spent += 1;
      return true;
    },
  };
};
