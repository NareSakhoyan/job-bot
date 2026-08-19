import { APPLICATION_STATUSES } from "@job-bot/shared";
import { humanizeEnum } from "@/lib/format";

export interface JobFilterValues {
  reachableOnly: string;
  minScore: string;
  role: string;
  company: string;
  location: string;
  status: string;
  sort: string;
}

const SORT_OPTIONS = [
  { value: "score", label: "Match score" },
  { value: "recent", label: "Recently discovered" },
  { value: "salary", label: "Salary" },
] as const;

const fieldClass =
  "w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-sky-500/60";

/**
 * Filters are a plain GET form, so state lives in the URL and every filtered
 * view is linkable and reloadable without any client-side JavaScript.
 */
export const JobFilters = ({
  values,
  companies,
  locations,
  profileSlug,
}: {
  values: JobFilterValues;
  companies: string[];
  locations: string[];
  profileSlug: string;
}) => (
  <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
    {/* A GET form drops anything not in a field, so the profile rides along. */}
    <input type="hidden" name="profile" value={profileSlug} />
    <label className="flex items-center gap-2 lg:col-span-2">
      <input
        type="checkbox"
        name="reachableOnly"
        value="1"
        defaultChecked={values.reachableOnly === "1"}
      />
      <span className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Reachable only
      </span>
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Min score
      </span>
      <input
        type="number"
        name="minScore"
        min={0}
        max={100}
        defaultValue={values.minScore}
        placeholder="0"
        className={fieldClass}
      />
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Role
      </span>
      <input type="text" name="role" defaultValue={values.role} placeholder="Backend" className={fieldClass} />
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Company
      </span>
      <input
        type="text"
        name="company"
        list="company-options"
        defaultValue={values.company}
        placeholder="Any"
        className={fieldClass}
      />
      <datalist id="company-options">
        {companies.map((company) => (
          <option key={company} value={company} />
        ))}
      </datalist>
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Location
      </span>
      <input
        type="text"
        name="location"
        list="location-options"
        defaultValue={values.location}
        placeholder="Any"
        className={fieldClass}
      />
      <datalist id="location-options">
        {locations.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Status
      </span>
      <select name="status" defaultValue={values.status} className={fieldClass}>
        <option value="">Any</option>
        {APPLICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {humanizeEnum(status)}
          </option>
        ))}
      </select>
    </label>

    <label className="lg:col-span-1">
      <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
        Sort by
      </span>
      <select name="sort" defaultValue={values.sort} className={fieldClass}>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>

    <div className="flex items-end gap-2 lg:col-span-1">
      <button
        type="submit"
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
      >
        Apply
      </button>
      <a
        href={`/jobs?profile=${encodeURIComponent(profileSlug)}`}
        className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
      >
        Reset
      </a>
    </div>
  </form>
);
