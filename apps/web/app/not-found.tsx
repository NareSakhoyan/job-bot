import Link from "next/link";

const NotFound = () => (
  <div className="py-20 text-center">
    <h1 className="text-lg font-semibold">Not found</h1>
    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
      That record does not exist in the database.
    </p>
    <Link href="/jobs" className="mt-4 inline-block text-sm text-sky-300 hover:text-sky-200">
      Back to jobs
    </Link>
  </div>
);

export default NotFound;
