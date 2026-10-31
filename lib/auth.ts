import { errors, jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "darroom_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(String(sessionVersion))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  let sessionVersion: number;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub || !payload.jti || !/^\d+$/.test(payload.jti)) return null;
    userId = payload.sub;
    sessionVersion = Number(payload.jti);
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      isEmailVerified: true,
      sessionVersion: true,
      role: true
    }
  });
  if (!user || user.sessionVersion !== sessionVersion) return null;
  const { sessionVersion: _sessionVersion, ...safeUser } = user;
  return safeUser;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user || !user.isEmailVerified) {
    throw new AuthError("Log in with a verified account to continue.", 401);
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AuthError("You do not have permission to perform this action.", 403);
  return user;
}

/**
 * Agent-only routes. Tenants can search, save and book viewings, but only
 * DALALI accounts may manage listings, photos, analytics or verification.
 */
export async function requireAgent() {
  const user = await requireUser();
  if (user.role !== "DALALI") {
    throw new AuthError("Only agent accounts can manage listings.", 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}

/**
 * Rejects a state-changing request whose `Origin` is not this deployment.
 * Two hosts are trusted: the request's own host (the custom domain or the
 * `*.vercel.app` alias the browser used) and `APP_URL`, so switching domains
 * does not break forms that were opened on the other one.
 */
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError("This request was rejected.", 403);
  }

  const allowed = new Set<string>();
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (requestHost) allowed.add(requestHost.split(",")[0].trim());

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host);
    } catch {
      // A malformed APP_URL must not make every POST fail.
    }
  }

  if (!allowed.has(originHost)) {
    throw new AuthError("This request was rejected.", 403);
  }
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Unexpected authentication/API failure", error);
  return NextResponse.json({ error: "Service unavailable at the moment." }, { status: 500 });
}

const TWO_FACTOR_COOKIE = "darroom_2fa";
const TWO_FACTOR_MAX_AGE = 60 * 10;

/**
 * Password-verified admins with a second factor get this short-lived token
 * instead of a session. Its `jti` is deliberately non-numeric so it can never
 * be accepted as a session by getSessionUser.
 */
export async function setTwoFactorCookie(response: NextResponse, userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti("2fa")
    .setIssuedAt()
    .setExpirationTime(`${TWO_FACTOR_MAX_AGE}s`)
    .sign(sessionSecret());
  response.cookies.set(TWO_FACTOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TWO_FACTOR_MAX_AGE
  });
}

export function clearTwoFactorCookie(response: NextResponse): void {
  response.cookies.set(TWO_FACTOR_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}

/** The admin still waiting to enter their code, or null when the step expired. */
export async function getTwoFactorPendingUser() {
  const token = (await cookies()).get(TWO_FACTOR_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub || payload.jti !== "2fa") return null;
    userId = payload.sub;
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }

  return prisma.user.findFirst({
    where: { id: userId, isActive: true, isEmailVerified: true, totpEnabled: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sessionVersion: true,
      totpSecret: true,
      totpBackupCodes: true
    }
  });
}
