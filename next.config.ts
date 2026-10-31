import type { NextConfig } from "next";

// Pages get a per-request CSP with a nonce from src/proxy.ts. API responses never need to run anything.
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit", "pg", "@prisma/client", "@prisma/adapter-pg"],
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }, { key: "Cache-Control", value: "no-store" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
