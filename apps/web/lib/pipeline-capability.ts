/**
 * Whether this deployment can launch worker processes.
 *
 * A pipeline run spawns the worker CLI as a child process — pnpm, Playwright,
 * a writable disk for logs. None of that exists on a serverless platform, so
 * there the dashboard is a read-only view of the data and runs stay something
 * you start on your own machine. Vercel sets VERCEL=1 at build and runtime.
 */
export const canRunPipeline = process.env.VERCEL === undefined;
