import { systemDb } from "./db";

/** Fixed-window counter in Postgres, shared across app instances. Returns false when exceeded. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const rows = await systemDb().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, "expiresAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}::double precision))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."expiresAt" < now() THEN 1 ELSE rate_limits.count + 1 END,
      "expiresAt" = CASE WHEN rate_limits."expiresAt" < now() THEN now() + make_interval(secs => ${windowSec}::double precision) ELSE rate_limits."expiresAt" END
    RETURNING count`;
  return rows[0].count <= max;
}
