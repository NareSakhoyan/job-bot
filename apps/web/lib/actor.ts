import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Who is performing an action, for the audit trail.
 *
 * The `human:` prefix is load-bearing. Repository writes that represent a
 * person's choice — approving an application, recording that one was sent —
 * check for it, so an agent cannot fabricate a decision. It only means
 * anything if the name after it is real, which is why this reads Clerk's
 * session rather than a header a client could set.
 *
 * Prefers the email address: an audit trail is read by a person months later,
 * and a Clerk user id identifies the right account while telling them nothing.
 */
export const currentActor = async (): Promise<string> => {
  const { userId } = await auth();
  if (!userId) {
    // Middleware protects every non-public route, so this is unreachable in
    // normal use. Throwing rather than falling back to an anonymous actor
    // keeps an unauthenticated write from ever being recorded as human.
    throw new Error("No signed-in user; refusing to record an action as human.");
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  return `human:${email ?? user?.username ?? userId}`;
};
