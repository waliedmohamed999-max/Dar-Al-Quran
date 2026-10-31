import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { systemDb } from "./db";
import { forbidden, unauthorized } from "./errors";
import type { Permission, RoleKey } from "./rbac";

export type Actor = {
  id: string;
  name: string;
  email: string;
  locale: string;
  roles: { key: RoleKey }[];
  perms: Set<Permission>;
  studentId: string | null;
  teacherId: string | null;
  guardianId: string | null;
  twoFactorEnabled: boolean;
};

export async function loadActor(userId: string): Promise<Actor | null> {
  const u = await systemDb().user.findUnique({
    where: { id: userId },
    include: {
      student: { select: { id: true } },
      teacher: { select: { id: true } },
      guardian: { select: { id: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!u || u.status !== "ACTIVE") return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    locale: u.locale,
    roles: u.roles.map((r) => ({ key: r.role.key as RoleKey })),
    perms: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key as Permission))),
    studentId: u.student?.id ?? null,
    teacherId: u.teacher?.id ?? null,
    guardianId: u.guardian?.id ?? null,
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

/** Roles and permissions are read from the database on every request, never from a client token. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  return s ? loadActor(s.user.id) : null;
});

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw unauthorized();
  return a;
}

export function assertPerm(a: Actor, p: Permission) {
  if (!a.perms.has(p)) throw forbidden();
}

/** Administrators need a second factor in production. MFA_REQUIRED=false is for isolated test systems only. */
export const mfaIsRequired = (a: Actor) =>
  a.roles.some((r) => r.key === "super_admin" || r.key === "admin") && (process.env.MFA_REQUIRED === "true" || (process.env.APP_ENV === "production" && process.env.MFA_REQUIRED !== "false"));
