# Development image for the whole workspace. Phase 1 optimises for "one command
# starts a working system", not for image size; a production multi-stage build
# comes later.
#
# Debian-based rather than Alpine: docker-compose.yml bind-mounts the host
# workspace into the container, and a glibc base keeps native binaries
# (Prisma engines, esbuild) compatible either way.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && apt-get clean

RUN corepack enable

WORKDIR /app

# Dependency manifests first, so an unrelated source edit does not invalidate
# the install layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/jobs/package.json ./packages/jobs/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm --filter @job-bot/database exec prisma generate

# Chromium and its system libraries, so the worker can fill forms and print
# resumes to PDF inside the container as well as on the host.
RUN pnpm --filter @job-bot/browser exec playwright install --with-deps chromium

EXPOSE 3000
CMD ["pnpm", "--filter", "@job-bot/web", "run", "dev"]
