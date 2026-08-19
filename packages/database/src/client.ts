import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "@job-bot/shared";

// The repo-root .env is loaded here rather than by each consumer: Next reads
// .env relative to apps/web, and the Prisma CLI relative to this package.
loadRootEnv();

/**
 * A single PrismaClient per process. Next.js dev-mode hot reloading would
 * otherwise open a new connection pool on every recompile.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const createClient = (): PrismaClient => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env for local work, or set it " +
        "in the deployment environment. The POSTGRES_* variables configure the local " +
        "docker-compose database; they are not read by Prisma.",
    );
  }

  return new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  });
};

/**
 * Constructed on first use, not on import.
 *
 * Prisma validates its datasource when the client is constructed, so building
 * this at module scope made merely *importing* the module require a reachable
 * DATABASE_URL. Next evaluates every page module while collecting routes at
 * build time — including pages marked force-dynamic, which never run a query
 * then — so a build with no database configured failed on the import rather
 * than on any actual use. Deferring construction means the build needs no
 * database and the first real query still gets a clear error if none is set.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = (globalForPrisma.prisma ??= createClient());
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
