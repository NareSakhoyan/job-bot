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

export default defineConfig({
  schema: join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
