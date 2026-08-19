import type { SalaryPeriod } from "@job-bot/database";

const PERIOD_SUFFIX: Record<SalaryPeriod, string> = {
  YEAR: "/yr",
  MONTH: "/mo",
  DAY: "/day",
  HOUR: "/hr",
};

const compact = (value: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value);

export const formatSalary = (input: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
}): string => {
  const { salaryMin, salaryMax } = input;
  if (salaryMin === null && salaryMax === null) return "Not published";

  const currency = input.salaryCurrency ?? "USD";
  const suffix = input.salaryPeriod ? PERIOD_SUFFIX[input.salaryPeriod] : "";

  if (salaryMin !== null && salaryMax !== null) {
    return `${compact(salaryMin, currency)} – ${compact(salaryMax, currency)}${suffix}`;
  }

  const single = (salaryMin ?? salaryMax) as number;
  const prefix = salaryMin !== null ? "from " : "up to ";
  return `${prefix}${compact(single, currency)}${suffix}`;
};

export const formatDate = (value: Date | null): string =>
  value === null
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        value,
      );

export const formatRelativeDays = (value: Date | null): string => {
  if (value === null) return "—";

  const days = Math.floor((Date.now() - value.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
};

export const humanizeEnum = (value: string | null): string =>
  value === null
    ? "—"
    : value
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
