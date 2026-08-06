import { NextRequest, NextResponse } from "next/server";

const LOCALE = "en";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Preserve the old domain's links and search equity while the rebrand settles.
  // This is intentionally host-based so /community, /events, and other indexed
  // paths keep their path and query string instead of collapsing to the homepage.
  const hostname = (
    request.headers.get("x-forwarded-host")?.split(",")[0] ??
    request.headers.get("host") ??
    request.nextUrl.hostname
  ).split(":")[0].toLowerCase();
  if (hostname === "clawplex.dev" || hostname === "www.clawplex.dev") {
    const destination = request.nextUrl.clone();
    destination.protocol = "https:";
    destination.host = "agentbuildersclub.dev";
    return NextResponse.redirect(destination, 308);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-claw-locale", LOCALE);
  requestHeaders.set("x-claw-pathname", pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|.*\\..*).*)",
  ],
};
