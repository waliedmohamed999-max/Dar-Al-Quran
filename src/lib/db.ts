import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const g = globalThis as unknown as { __system?: PrismaClient; __app?: PrismaClient };

/**
 * Owner connection, not subject to RLS. Reserved for auth, public content reads, background jobs
 * and audit writes. Request handlers must use withActor for anything student-related.
 */
export function systemDb(): PrismaClient {
  return (g.__system ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl, max: 10 }) }));
}

function appDb(): PrismaClient {
  return (g.__app ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.appDatabaseUrl, max: 20 }) }));
}

export type Tx = Prisma.TransactionClient;

/** Runs `fn` in a transaction as the restricted role, with RLS scoped to this user. */
export function withActor<T>(actor: { id: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${actor.id}, true)`;
    return fn(tx);
  }, { timeout: 15000 });
}
