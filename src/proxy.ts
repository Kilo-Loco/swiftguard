import { NextRequest, NextResponse } from "next/server";

const VALID_KEYS = new Set(["sg_demo_key_2026"]);

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100;
const WINDOW_MS = 60_000;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/v1/* routes
  if (!pathname.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  // Allow signup without auth
  if (pathname === "/api/v1/signup") {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Allow requests without auth for demo (the landing page calls /api/v1/review directly)
  // If an auth header IS provided, validate it
  if (authHeader && !key) {
    return NextResponse.json(
      {
        error: "Invalid Authorization header format. Use: Authorization: Bearer <api-key>",
        hint: "Get a demo key at the SwiftGuard landing page or use: sg_demo_key_2026",
      },
      { status: 401 }
    );
  }

  if (key && !VALID_KEYS.has(key)) {
    return NextResponse.json(
      {
        error: "Invalid API key",
        hint: "Use the demo key: sg_demo_key_2026",
      },
      { status: 401 }
    );
  }

  // Rate limiting by key or IP
  const rateLimitKey = key || request.headers.get("x-forwarded-for") || "anonymous";
  const now = Date.now();
  const entry = rateLimitMap.get(rateLimitKey);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(rateLimitKey, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Maximum ${RATE_LIMIT} requests per minute. Try again shortly.`,
        },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};
