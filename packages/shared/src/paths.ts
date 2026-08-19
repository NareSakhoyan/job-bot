import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Locations are resolved from the working directory rather than from
 * `import.meta.url`: this module gets bundled by Next, where the module URL
 * points into `.next/server` and would defeat any upward walk.
 */
const walkUpFor = (marker: string, startDir: string): string | null => {
  let current = resolve(startDir);

  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(join(current, marker))) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }

  return null;
};

/** Directory containing pnpm-workspace.yaml, i.e. the repo root. */
export const resolveRepoRoot = (startDir: string = process.cwd()): string => {
  const root = walkUpFor("pnpm-workspace.yaml", startDir);
  if (root === null) {
    throw new Error(
      `Could not locate the repository root from ${startDir} (no pnpm-workspace.yaml found).`,
    );
  }
  return root;
};

/** The repo-root data/ directory. `DATA_DIR` overrides it outright. */
export const resolveDataDir = (startDir: string = process.cwd()): string => {
  const override = process.env.DATA_DIR;
  if (override) return resolve(override);

  const dataDir = join(resolveRepoRoot(startDir), "data");
  if (!existsSync(join(dataDir, "profiles"))) {
    throw new Error(
      `Expected a profiles directory at ${dataDir}. Set DATA_DIR to an absolute path if you moved it.`,
    );
  }

  return dataDir;
};

export const dataPath = (...segments: string[]): string => join(resolveDataDir(), ...segments);

/** Files for one profile live together under data/profiles/<slug>/. */
export const profilePath = (slug: string, ...segments: string[]): string =>
  dataPath("profiles", slug, ...segments);

/**
 * Every profile slug on disk — one directory per CV. Discovery is by
 * directory listing, so adding a CV is adding a folder.
 */
export const listProfileSlugs = (): string[] => {
  const root = dataPath("profiles");
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "profile.json")))
    .map((entry) => entry.name)
    .sort();
};

/**
 * Loads the repo-root .env into process.env. Node's loader leaves variables
 * that are already set untouched, so container-supplied configuration always
 * wins. A missing file is not an error: production supplies real env vars.
 */
export const loadRootEnv = (startDir: string = process.cwd()): void => {
  const root = walkUpFor("pnpm-workspace.yaml", startDir);
  if (root === null) return;

  const envFile = join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
};
