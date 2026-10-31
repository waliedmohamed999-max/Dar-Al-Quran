import { NextResponse } from "next/server";
import { systemDb } from "@/lib/db";

/** Liveness and queue depth for monitoring. Contains no personal data. */
export async function GET() {
  try {
    const db = systemDb();
    await db.$queryRaw`SELECT 1`;
    const [pending, failed] = await Promise.all([db.job.count({ where: { status: "PENDING" } }), db.job.count({ where: { status: "FAILED" } })]);
    return NextResponse.json({ status: "ok", jobs: { pending, failed } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
