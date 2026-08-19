import type { ApplicationStatus, MatchRecommendation } from "@job-bot/database";
import { humanizeEnum } from "@/lib/format";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  DISCOVERED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  ANALYZED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  SHORTLISTED: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  REJECTED: "border-zinc-600/40 bg-zinc-600/10 text-zinc-400",
  PREPARING: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  READY_FOR_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  SUBMITTED: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  WITHDRAWN: "border-zinc-600/40 bg-zinc-600/10 text-zinc-400",
  REJECTED_BY_COMPANY: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  INTERVIEW: "border-lime-500/40 bg-lime-500/10 text-lime-300",
};

export const StatusBadge = ({ status }: { status: ApplicationStatus | null }) =>
  status === null ? (
    <span className="text-xs text-[var(--color-ink-muted)]">—</span>
  ) : (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {humanizeEnum(status)}
    </span>
  );

const scoreTone = (score: number): string => {
  if (score >= 75) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (score >= 55) return "border-sky-500/40 bg-sky-500/10 text-sky-300";
  if (score >= 35) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-300";
};

export const ScoreBadge = ({ score }: { score: number | null }) =>
  score === null ? (
    <span className="text-xs text-[var(--color-ink-muted)]">Not analysed</span>
  ) : (
    <span
      className={`inline-flex min-w-11 justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(score)}`}
    >
      {score}
    </span>
  );

export const RecommendationBadge = ({ value }: { value: MatchRecommendation }) => (
  <span className="text-sm font-medium text-[var(--color-ink)]">{humanizeEnum(value)}</span>
);
