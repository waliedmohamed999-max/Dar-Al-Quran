import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "./env";
import { AppError } from "./errors";
import { rateLimit } from "./rate-limit";
import type { Permission } from "./rbac";
import { getActor, type Actor, mfaIsRequired } from "./session";

export type EndpointCtx = { actor: Actor | null; body: unknown; params: Record<string, string>; req: NextRequest };

export type EndpointDef = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  public?: boolean;
  perm?: Permission;
  body?: z.ZodType;
  limit?: { max: number; windowSec: number };
  run: (c: EndpointCtx) => Promise<unknown> | unknown;
};

/**
 * Forwarded addresses are client-controlled unless a proxy we run sets them, so they count only with
 * TRUST_PROXY=true. The last entry is the one that proxy added.
 */
export function clientIp(req: NextRequest) {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "direct";
}

/** CSRF defence in depth on top of SameSite=Lax cookies: state changes must be same-origin. */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) throw new AppError(403, "origin_required");
  if (origin !== new URL(env.appUrl).origin && origin !== req.nextUrl.origin) throw new AppError(403, "bad_origin");
}

export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.code }, { status: e.status });
  if (e instanceof z.ZodError) {
    return NextResponse.json({ error: "validation", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const code = (e as { code?: string }).code;
  if (code === "P2025") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (code === "P2002") return NextResponse.json({ error: "conflict" }, { status: 409 });
  const text = String((e as Error)?.message ?? "");
  if (/row-level security|permission denied|42501/.test(text)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  console.error("[api] unhandled", (e as Error)?.name, text.slice(0, 500));
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Order for every request: origin, route, rate limit, authentication, permission, validation. */
export async function dispatch(req: NextRequest, path: string, endpoints: EndpointDef[]) {
  try {
    assertSameOrigin(req);
    let def: EndpointDef | undefined;
    let params: Record<string, string> | null = null;
    for (const e of endpoints) {
      if (e.method !== req.method) continue;
      params = match(e.path, path);
      if (params) { def = e; break; }
    }
    if (!def || !params) throw new AppError(404, "not_found");
    const actor = await getActor();
    const allowed = await rateLimit(`${def.method}:${def.path}:${actor?.id ?? clientIp(req)}`, def.limit?.max ?? 120, def.limit?.windowSec ?? 60);
    if (!allowed) throw new AppError(429, "rate_limited");
    if (!def.public && !actor) throw new AppError(401, "unauthorized");
    if (actor && mfaIsRequired(actor) && !actor.twoFactorEnabled && !path.startsWith("/me/")) throw new AppError(403, "mfa_required");
    if (def.perm && !actor?.perms.has(def.perm)) throw new AppError(403, "forbidden");
    const body = def.body ? def.body.parse(await req.json().catch(() => { throw new AppError(400, "invalid_json"); })) : undefined;
    const data = await def.run({ actor, body, params, req });
    return data instanceof Response ? data : NextResponse.json({ data: data ?? null });
  } catch (e) {
    return toErrorResponse(e);
  }
}
