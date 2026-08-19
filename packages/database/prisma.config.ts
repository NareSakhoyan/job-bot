import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig } from "prisma/config";

/**
 * The Prisma CLI runs with this package as its working directory, so it would
 * otherwise look for .env here rather than at the repo root. The lookup is
 * inlined rather than imported from @job-bot/shared because this file is
 * loaded by the Prisma CLI's own module loader, before workspace resolution.
 */
const loadRootEnv = (): void => {
  let current = import.meta.dirname;

  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      const envFile = join(current, ".env");
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      return;
    }

    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

loadRootEnv();

/**
 * `directUrl = env("DIRECT_URL")` in the schema is a hard requirement, not a
 * fallback: Prisma fails validation if the variable is absent, even when the
 * pooled and direct connections are the same host. Defaulting it here keeps a
 * plain local Postgres working with only DATABASE_URL set, while a pooled host
 * still gets its separate direct connection when one is provided.
 */
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
