import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // Staging and development must not be indexed.
  if (process.env.APP_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/student", "/teacher", "/guardian", "/admin", "/account", "/messages", "/live", "/ai"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
