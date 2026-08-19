/**
 * The result of assessing one factor. `applicable: false` means the data
 * needed to judge it is absent — the factor's weight is then redistributed
 * rather than the job being scored down for it.
 */
export interface FactorOutcome {
  applicable: boolean;
  score: number;
  detail: string;
}
