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

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
