import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional shared-secret gate for the dashboard.
 *
 * The dashboard approves applications and edits the profile the agent speaks
 * from, so it should not be openly reachable once it leaves localhost. Set
 * `DASHBOARD_PASSWORD` and every request needs Basic auth; leave it unset and
 * nothing changes, which keeps local development frictionless.
 *
 * This is a single shared secret, not user accounts — appropriate for a
 * personal tool, and not a substitute for real auth if this is ever exposed to
 * more than one person.
 */
export const middleware = (request: NextRequest): NextResponse => {
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    // Fail closed off localhost. This dashboard approves applications, and an
    // approval is what unlocks automated submission — so an unauthenticated
    // dashboard on a network is an unauthenticated path to sending mail in
    // someone's name. Development on localhost stays frictionless.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "DASHBOARD_PASSWORD is not set. Refusing to serve an unauthenticated dashboard in production.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const password = decoded.slice(decoded.indexOf(":") + 1);

    // Length-independent comparison is overkill for a local tool, but a
    // constant-time check costs nothing and avoids a bad habit.
    if (password.length === expected.length) {
      let mismatch = 0;
      for (let index = 0; index < password.length; index += 1) {
        mismatch |= password.charCodeAt(index) ^ expected.charCodeAt(index);
      }
      if (mismatch === 0) return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Job Bot", charset="UTF-8"' },
  });
};

export const config = {
  // Static assets are not worth gating and would break the login prompt.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
