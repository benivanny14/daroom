import { NextRequest, NextResponse } from "next/server";

/**
 * Every state-changing request must come from this site.
 *
 * Browsers always send `Origin` on POST/PUT/PATCH/DELETE and label the source
 * with `Sec-Fetch-Site`, so a request carrying neither header did not come from
 * a browser on this origin and is rejected. `assertSameOrigin` inside each
 * route handler stays as a second line of defence.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REJECTED_BODY = JSON.stringify({ error: "This request was rejected." });

/**
 * Endpoints called by other servers. They authenticate with a shared secret or
 * a provider signature instead of a browser Origin, so the site check does not
 * apply to them.
 */
const SERVER_TO_SERVER = [/^\/api\/cron\//, /^\/api\/payments\/webhook$/];

/**
 * Endpoints whose response is the same for every visitor and may be cached by
 * a shared cache. Anything else under `/api` is answered per user, so it must
 * never be stored by a proxy or a browser cache.
 */
const PUBLIC_API = [
  /^\/api\/listings$/,
  /^\/api\/listings\/[^/]+$/,
  /^\/api\/geography$/,
  /^\/api\/pages\/[^/]+$/,
  /^\/api\/reviews$/,
  /^\/api\/auth\/verify$/
];

function reject(): NextResponse {
  const response = new NextResponse(REJECTED_BODY, {
    status: 403,
    headers: { "Content-Type": "application/json" }
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** Marks the response as per-user so no shared cache can replay it. */
function pass(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (!PUBLIC_API.some((pattern) => pattern.test(pathname))) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export function middleware(request: NextRequest) {
  if (SERVER_TO_SERVER.some((pattern) => pattern.test(request.nextUrl.pathname))) {
    return pass(request);
  }

  if (!MUTATING_METHODS.has(request.method)) return pass(request);

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return reject();
  }

  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== request.headers.get("host")) {
      return reject();
    }
  } else if (!fetchSite) {
    // No browser identification at all: not a request this API serves.
    return reject();
  }

  return pass(request);
}

export const config = {
  matcher: ["/api/:path*"]
};
