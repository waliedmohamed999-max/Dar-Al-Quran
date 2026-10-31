import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { systemDb, withActor } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { ROLES, type RoleKey } from "@/lib/rbac";
import type { Actor } from "@/lib/session";
import { notify } from "../notifications/service";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().toLowerCase(),
  password: z.string().min(10).max(128),
  accountType: z.enum(["student", "guardian"]),
  isMinor: z.boolean().default(false),
  locale: z.enum(["ar", "en"]).default("ar"),
  acceptTerms: z.literal(true),
});

async function assignRole(userId: string, key: RoleKey) {
  const db = systemDb();
  const role = await db.role.findUniqueOrThrow({ where: { key } });
  await db.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
  if (key === "student") await db.student.upsert({ where: { userId }, update: {}, create: { userId } });
  if (key === "guardian") await db.guardian.upsert({ where: { userId }, update: {}, create: { userId } });
  if (key === "teacher") await db.teacher.upsert({ where: { userId }, update: {}, create: { userId } });
}

/** Self-registration can only create student or guardian accounts. Staff roles are assigned by staff. */
export async function register(input: z.infer<typeof registerSchema>) {
  const db = systemDb();
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    // Same response as success, so this endpoint does not reveal which emails have accounts.
    return { ok: true };
  }
  const res = await auth.api.signUpEmail({ body: { name: input.name, email: input.email, password: input.password } });
  await db.user.update({ where: { id: res.user.id }, data: { locale: input.locale } });
  await assignRole(res.user.id, input.accountType);
  if (input.accountType === "student" && input.isMinor) {
    await db.student.update({ where: { userId: res.user.id }, data: { isMinor: true } });
  }
  await audit(res.user.id, "user.register", "User", res.user.id, { type: input.accountType });
  return { ok: true };
}

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().toLowerCase(),
  role: z.enum(ROLES),
});

/** Creates the account with an unusable random password; the user sets theirs via the reset link. */
export async function createUserByStaff(actor: Actor, input: z.infer<typeof staffCreateSchema>) {
  const sensitive = ["super_admin", "admin", "supervisor"].includes(input.role);
  if (!actor.perms.has("users.manage")) throw forbidden();
  if (sensitive && !actor.perms.has("roles.assign")) throw forbidden();
  const db = systemDb();
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict("email_taken");
  const res = await auth.api.signUpEmail({ body: { name: input.name, email: input.email, password: randomBytes(32).toString("base64url") } });
  await assignRole(res.user.id, input.role);
  await auth.api.requestPasswordReset({ body: { email: input.email, redirectTo: "/reset-password" } });
  await audit(actor.id, "user.create", "User", res.user.id, { role: input.role });
  return { id: res.user.id };
}

export async function setRole(actor: Actor, userId: string, role: RoleKey, grant: boolean) {
  if (!actor.perms.has("roles.assign")) throw forbidden();
  if (userId === actor.id && !grant) throw conflict("cannot_change_own_roles");
  if (grant) await assignRole(userId, role);
  else {
    const r = await systemDb().role.findUniqueOrThrow({ where: { key: role } });
    await systemDb().userRole.deleteMany({ where: { userId, roleId: r.id } });
  }
  await audit(actor.id, grant ? "role.grant" : "role.revoke", "User", userId, { role });
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") {
  if (userId === actor.id) throw conflict("cannot_change_own_status");
  await withActor(actor, (tx) => tx.user.update({ where: { id: userId }, data: { status } }));
  if (status !== "ACTIVE") await systemDb().authSession.deleteMany({ where: { userId } });
  await audit(actor.id, "user.status", "User", userId, { status });
}

// ---------- Guardian linking ----------

/** Always reports success so this endpoint cannot be used to discover which students exist. */
export async function requestGuardianLink(actor: Actor, input: { studentEmail: string; relation: string }) {
  if (!actor.guardianId) throw forbidden();
  const student = await systemDb().student.findFirst({ where: { user: { email: input.studentEmail } }, select: { id: true } });
  if (student) {
    await withActor(actor, (tx) =>
      tx.guardianStudentLink.create({ data: { guardianId: actor.guardianId!, studentId: student.id, relation: input.relation, status: "PENDING" } }),
    ).catch((e) => { if ((e as { code?: string }).code !== "P2002") throw e; });
  }
  await audit(actor.id, "guardian.link_request", "Guardian", actor.guardianId);
  return { ok: true };
}

/** Staff approve only after verifying the relationship through the school's official process. */
export async function decideGuardianLink(actor: Actor, id: string, approve: boolean, verified: boolean) {
  if (approve && !verified) throw conflict("verification_required");
  const link = await withActor(actor, (tx) =>
    tx.guardianStudentLink.update({
      where: { id },
      data: approve ? { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } : { status: "REJECTED" },
      include: { guardian: { select: { userId: true } } },
    }),
  );
  await audit(actor.id, approve ? "guardian.link_approve" : "guardian.link_reject", "GuardianStudentLink", id);
  await notify([link.guardian.userId], approve ? "guardian.approved" : "guardian.rejected", {});
  return link;
}

export async function revokeGuardianLink(actor: Actor, id: string) {
  await withActor(actor, (tx) => tx.guardianStudentLink.update({ where: { id }, data: { status: "REVOKED" } }));
  await audit(actor.id, "guardian.link_revoke", "GuardianStudentLink", id);
}

/** Guardian consent for a minor's recordings. Revoking stops new uploads. */
export async function setRecordingConsent(actor: Actor, studentId: string, granted: boolean) {
  if (!actor.guardianId) throw forbidden();
  const link = await withActor(actor, (tx) => tx.guardianStudentLink.findFirst({ where: { studentId, guardianId: actor.guardianId!, status: "APPROVED" } }));
  if (!link) throw notFound();
  await systemDb().student.update({ where: { id: studentId }, data: granted ? { recordingConsentAt: new Date(), recordingConsentBy: actor.id } : { recordingConsentAt: null, recordingConsentBy: null } });
  await systemDb().guardianStudentLink.update({ where: { id: link.id }, data: { consentAt: granted ? new Date() : null } });
  await audit(actor.id, granted ? "consent.grant" : "consent.revoke", "Student", studentId);
}

const isAdminUser = async (userId: string) => (await systemDb().userRole.count({ where: { userId, role: { key: { in: ["super_admin", "admin"] } } } })) > 0;

/** Permitted: administration with teachers and guardians, and guardians with their child's teacher. */
export async function sendMessage(actor: Actor, input: { studentId?: string; recipientId: string; body: string }) {
  const db = systemDb();
  const actorAdmin = actor.roles.some((r) => r.key === "super_admin" || r.key === "admin");
  let allowed = false;
  if (actorAdmin) {
    allowed = (await db.teacher.count({ where: { userId: input.recipientId } })) + (await db.guardian.count({ where: { userId: input.recipientId } })) > 0;
  } else if ((actor.teacherId || actor.guardianId) && (await isAdminUser(input.recipientId))) {
    allowed = true;
  } else if (input.studentId) {
    const sid = input.studentId;
    if (actor.guardianId && (await db.guardianStudentLink.count({ where: { guardianId: actor.guardianId, studentId: sid, status: "APPROVED" } }))) {
      allowed = (await db.enrollment.count({ where: { studentId: sid, status: "ACTIVE", halaqa: { teacher: { userId: input.recipientId } } } })) > 0;
    } else if (actor.teacherId && (await db.enrollment.count({ where: { studentId: sid, status: "ACTIVE", halaqa: { teacherId: actor.teacherId } } }))) {
      allowed = (await db.guardianStudentLink.count({ where: { studentId: sid, status: "APPROVED", guardian: { userId: input.recipientId } } })) > 0;
    }
  }
  if (!allowed) throw forbidden();
  const m = await withActor(actor, (tx) => tx.message.create({ data: { senderId: actor.id, recipientId: input.recipientId, studentId: input.studentId ?? null, body: input.body } }));
  await notify([input.recipientId], "message.received", {}, "/messages");
  return m;
}

export const myNotifications = (actor: Actor) =>
  withActor(actor, (tx) => tx.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 50 }));

/** A user's own data as JSON, for access requests. */
export const exportMyData = (actor: Actor) =>
  withActor(actor, async (tx) => ({
    user: await tx.user.findUnique({ where: { id: actor.id }, select: { id: true, name: true, email: true, locale: true, createdAt: true } }),
    student: actor.studentId
      ? await tx.student.findUnique({
          where: { id: actor.studentId },
          include: { tasks: true, memorizations: true, revisions: true, attendance: true, reviews: true, certificates: true, enrollments: true },
        })
      : null,
    bookmarks: await tx.bookmark.findMany({ where: { userId: actor.id } }),
  }));
