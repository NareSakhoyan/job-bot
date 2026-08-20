import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Every route requires a signed-in user.
 *
 * The dashboard approves applications — the step that makes one eligible to be
 * sent — and edits the profile that generation draws its facts from. Neither
 * should be reachable by anyone who finds the URL.
 *
 * Protecting by default and listing the exceptions is deliberate: the opposite
 * shape means a route added later is public until someone remembers to guard
 * it, and the thing left unguarded would be a page that can send mail in
 * someone's name.
 */
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublic(request)) return;

  const { userId } = await auth();
  if (userId) return;

  // Redirecting explicitly rather than calling auth.protect(): protect()
  // answers an unauthenticated page request with 404 unless Clerk has been
  // told where sign-in lives, which reads as a broken deployment rather than
  // a login prompt. The original path rides along so signing in lands where
  // the person was going.
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("redirect_url", request.url);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: [
    // Everything except Next's static output and files with an extension.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|cur|heic|heif|webmanifest))(?:.*)|api|trpc)(.*)",
  ],
};
