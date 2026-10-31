import { randomUUID } from "node:crypto";
import { systemDb } from "@/lib/db";
import { loadActor, type Actor } from "@/lib/session";

export const db = () => systemDb();

export async function actorByEmail(email: string): Promise<Actor> {
  const u = await db().user.findUniqueOrThrow({ where: { email } });
  return (await loadActor(u.id))!;
}

export const demo = async () => ({
  superAdmin: await actorByEmail("super@demo.test"),
  admin: await actorByEmail("admin@demo.test"),
  supervisor: await actorByEmail("supervisor@demo.test"),
  teacher: await actorByEmail("teacher@demo.test"),
  teacher2: await actorByEmail("teacher2@demo.test"),
  student: await actorByEmail("student@demo.test"),
  student2: await actorByEmail("student2@demo.test"),
  minor: await actorByEmail("student3@demo.test"),
  guardian: await actorByEmail("guardian@demo.test"),
});

/** A throwaway student enrolled unless told otherwise. */
export async function makeStudent(halaqaId?: string): Promise<Actor> {
  const email = `t-${randomUUID()}@test.invalid`;
  const role = await db().role.findUniqueOrThrow({ where: { key: "student" } });
  const user = await db().user.create({ data: { email, name: "طالب اختبار", isDemo: true, roles: { create: { roleId: role.id } }, student: { create: {} } } });
  const actor = (await loadActor(user.id))!;
  if (halaqaId) await db().enrollment.create({ data: { halaqaId, studentId: actor.studentId!, status: "ACTIVE" } });
  return actor;
}

export const demoHalaqa = () => db().halaqa.findFirstOrThrow({ where: { name: "[تجريبي] حلقة الفرقان" } });
