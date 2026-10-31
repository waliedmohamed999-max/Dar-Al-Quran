import { systemDb } from "./db";

/** Meta must hold identifiers and field names only, never personal data. */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta: Record<string, string | number | boolean | null | string[]> = {}) {
  await systemDb().auditLog.create({ data: { actorId, action, entity, entityId: entityId ?? null, meta } });
}
