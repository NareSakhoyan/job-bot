import type { JobDetail } from "@job-bot/database";
import { RecommendationBadge, ScoreBadge } from "@/components/badges";
import { BulletList, Card, Chip, EmptyState } from "@/components/ui";
import { FactorBreakdown } from "@/components/factor-breakdown";

const PLACEHOLDER_PREFIX = "seed-placeholder";
const MODEL_REASONED = /\+/;

export const MatchPanel = ({ match }: { match: JobDetail["match"] }) => {
  if (!match) {
    return (
      <Card title="Match analysis">
        <EmptyState
          title="Not analysed yet"
          hint="Run pnpm match to score this job. Deterministic factors always apply; model reasoning is added when an LLM provider is configured."
        />
      </Card>
    );
  }

  const isPlaceholder = match.modelVersion.startsWith(PLACEHOLDER_PREFIX);
  const reasonedByModel = !isPlaceholder && MODEL_REASONED.test(match.modelVersion);

  return (
    <Card
      title="Match analysis"
      action={
        isPlaceholder ? (
          <Chip tone="warn">Placeholder — run pnpm match to replace</Chip>
        ) : reasonedByModel ? (
          <Chip>Deterministic score + model reasoning</Chip>
        ) : (
          <Chip tone="warn">Deterministic only — no LLM configured</Chip>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <ScoreBadge score={match.score} />
          <RecommendationBadge value={match.recommendation} />
          <span className="text-xs text-[var(--color-ink-muted)]">
            deterministic {match.deterministicScore} · confidence {(match.confidence * 100).toFixed(0)}% ·{" "}
            {match.modelVersion}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-300">Strengths</h3>
            <BulletList items={match.matchingSkills} empty="No matching skills recorded." />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-300">Gaps</h3>
            <BulletList items={match.missingSkills} empty="No gaps recorded." />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-rose-300">Concerns</h3>
          <BulletList items={match.concerns} empty="No concerns recorded." />
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Score breakdown
          </h3>
          <FactorBreakdown factors={match.factors} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Reasoning
          </h3>
          <p className="text-sm leading-relaxed text-[var(--color-ink)]">{match.reasoning}</p>
        </div>
      </div>
    </Card>
  );
};
