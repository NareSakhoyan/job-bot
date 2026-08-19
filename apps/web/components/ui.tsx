import type { ReactNode } from "react";

export const Card = ({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
    {title ? (
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-line)] px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
          {title}
        </h2>
        {action}
      </header>
    ) : null}
    <div className="p-5">{children}</div>
  </section>
);

export const Chip = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${
      tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-[var(--color-line)] bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)]"
    }`}
  >
    {children}
  </span>
);

export const EmptyState = ({ title, hint }: { title: string; hint: string }) => (
  <div className="rounded-lg border border-dashed border-[var(--color-line)] px-5 py-10 text-center">
    <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{hint}</p>
  </div>
);

export const DefinitionList = ({ items }: { items: Array<[string, ReactNode]> }) => (
  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
    {items.map(([term, value]) => (
      <div key={term}>
        <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{term}</dt>
        <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value}</dd>
      </div>
    ))}
  </dl>
);

export const BulletList = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length === 0 ? (
    <p className="text-sm text-[var(--color-ink-muted)]">{empty}</p>
  ) : (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-[var(--color-ink)]">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-ink-muted)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
