import { NextResponse, type NextRequest } from "next/server";

const audioHosts = "https://everyayah.com https://*.everyayah.com https://verses.quran.foundation";

/** A new nonce for each response, so no inline script runs unless the server itself wrote it. */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  const s3 = process.env.S3_PUBLIC_ORIGIN ?? process.env.S3_ENDPOINT ?? "";
  const jitsi = process.env.LIVE_JITSI_DOMAIN ? `https://${process.env.LIVE_JITSI_DOMAIN}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `media-src 'self' blob: ${audioHosts} ${s3}`,
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-src ${jitsi || "'none'"}`,
    "object-src 'none'",
  ].join("; ");
}

// Arabic is the default and has no URL prefix; English lives under /en.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (process.env.CLIENT_PREVIEW === "true" && pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Client preview: saving and authentication are disabled." }, { status: 503 });
  }
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (pathname === "/ar" || pathname.startsWith("/ar/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url);
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  // Next reads the nonce from this request header and applies it to its own scripts.
  headers.set("content-security-policy", csp);
  const jitsi = process.env.LIVE_JITSI_DOMAIN ? `https://${process.env.LIVE_JITSI_DOMAIN}` : "";
  let res: NextResponse;
  if (process.env.CLIENT_PREVIEW === "true") {
    const url = req.nextUrl.clone();
    const english = pathname === "/en" || pathname.startsWith("/en/");
    const path = english ? pathname.slice(3) : pathname;
    url.pathname = `/${english ? "en" : "ar"}/client-preview${path === "/" ? "" : path}`;
    res = NextResponse.rewrite(url, { request: { headers } });
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  else if (pathname === "/en" || pathname.startsWith("/en/")) res = NextResponse.next({ request: { headers } });
  else {
    const url = req.nextUrl.clone();
    url.pathname = `/ar${pathname === "/" ? "" : pathname}`;
    res = NextResponse.rewrite(url, { request: { headers } });
  }
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Permissions-Policy", jitsi ? `camera=(self "${jitsi}"), geolocation=(), microphone=(self "${jitsi}"), display-capture=(self "${jitsi}")` : "camera=(), geolocation=(), microphone=(self)");
  return res;
}

export const config = {
  matcher: ["/((?!_next|fonts|sw.js|favicon.ico|icon.svg|robots.txt|sitemap.xml|opengraph-image).*)"],
};
