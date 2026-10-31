import { NextResponse, type NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { clientIp } from "@/lib/api";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Sign-up goes through /api/v1/register, which controls which roles can self-register.
  if (path.endsWith("/sign-up/email")) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Durable limit shared across instances, in addition to the library's own limiter.
  if (!(await rateLimit(`auth:${path}:${clientIp(req)}`, 20, 300))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return handlers.POST(req);
}
