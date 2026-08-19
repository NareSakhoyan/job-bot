import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A production `next build` writes into the same directory a running
  // `next dev` is serving from, which silently 404s the dev server's CSS and
  // leaves the app rendering unstyled HTML.
  //
  // The default stays `.next`, because every deployment host looks for it and
  // finds nothing otherwise. `pnpm build:isolated` sets this to `.next-build`
  // for the case the warning is about: building while a dev server runs.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Workspace packages ship TypeScript source rather than a build artefact.
  transpilePackages: ["@job-bot/shared", "@job-bot/database", "@job-bot/jobs"],
  // Prisma must not be bundled into the server runtime.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
