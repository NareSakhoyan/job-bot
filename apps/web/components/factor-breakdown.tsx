import { matchFactorsSchema, type MatchFactor } from "@job-bot/shared";
import { humanizeEnum } from "@/lib/format";

const barTone = (score: number): string => {
  if (score >= 75) return "bg-emerald-500/70";
  if (score >= 55) return "bg-sky-500/70";
  if (score >= 35) return "bg-amber-500/70";
  return "bg-rose-500/70";
};

/**
 * Renders the deterministic factor breakdown. `factors` arrives as JSON from
 * the database, so it is validated before use rather than cast.
 */
export const FactorBreakdown = ({ factors }: { factors: unknown }) => {
  const parsed = matchFactorsSchema.safeParse(factors);

  if (!parsed.success || parsed.data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">
        No factor breakdown recorded for this match.
      </p>
    );
  }

  const applicable = parsed.data.filter((factor: MatchFactor) => factor.weight > 0);
  const skipped = parsed.data.filter((factor: MatchFactor) => factor.weight === 0);

  return (
    <div className="space-y-3">
      {applicable.map((factor) => (
        <div key={factor.factor}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[var(--color-ink)]">{humanizeEnum(factor.factor)}</span>
            <span className="tabular-nums text-[var(--color-ink-muted)]">
              {factor.score}/100 · weight {(factor.weight * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
            <div className={`h-full ${barTone(factor.score)}`} style={{ width: `${factor.score}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{factor.detail}</p>
        </div>
      ))}

      {skipped.length > 0 ? (
        <div className="border-t border-[var(--color-line)] pt-3">
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
            Not assessed — weight redistributed
          </p>
          <ul className="mt-1.5 space-y-1">
            {skipped.map((factor) => (
              <li key={factor.factor} className="text-xs text-[var(--color-ink-muted)]">
                {humanizeEnum(factor.factor)}: {factor.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
