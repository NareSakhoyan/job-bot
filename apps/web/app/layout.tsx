import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Bot",
  description: "Personal job search and application agent",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/review", label: "Ready to apply" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "Profile" },
];

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en">
    <body className="min-h-screen antialiased">
      <ClerkProvider appearance={clerkAppearance}>
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6">
          <header className="flex flex-wrap items-center gap-6 border-b border-[var(--color-line)] py-5">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Job Bot
            </Link>
            <nav className="flex flex-wrap gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-[var(--color-ink-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto rounded-md border border-[var(--color-line)] px-2.5 py-1 text-xs text-[var(--color-ink-muted)]">
              nothing auto-submits
            </span>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-[var(--color-line)] py-5 text-xs text-[var(--color-ink-muted)]">
            Applications are never submitted without explicit approval.
          </footer>
        </div>
      </ClerkProvider>
    </body>
  </html>
);

export default RootLayout;
