export const PERMISSIONS = [
  "users.manage", "roles.assign", "students.view_all", "halaqas.manage",
  "enrollments.request", "attendance.record", "plans.manage", "tasks.assign", "reviews.write",
  "assessments.manage", "certificates.request", "certificates.approve", "content.manage",
  "content.review", "scholarly.review", "reports.view", "reports.export", "audit.view",
  "settings.manage", "guardians.link", "notifications.manage", "messages.send", "ai.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["super_admin", "admin", "supervisor", "teacher", "student", "guardian"] as const;
export type RoleKey = (typeof ROLES)[number];

const STAFF: Permission[] = ["students.view_all", "attendance.record", "plans.manage", "tasks.assign", "reports.view", "reports.export", "messages.send"];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "roles.assign"),
  supervisor: [...STAFF, "halaqas.manage", "reviews.write", "assessments.manage", "certificates.request", "guardians.link"],
  teacher: ["attendance.record", "plans.manage", "tasks.assign", "reviews.write", "assessments.manage", "certificates.request", "reports.view", "messages.send"],
  student: ["enrollments.request"],
  guardian: ["enrollments.request", "messages.send"],
};

export const ROLE_NAMES: Record<RoleKey, { ar: string; en: string }> = {
  super_admin: { ar: "مدير عام", en: "Super Admin" },
  admin: { ar: "مدير الدار", en: "Admin" },
  supervisor: { ar: "مشرف تعليم ومتابعة", en: "Supervisor" },
  teacher: { ar: "معلم / محفظ", en: "Teacher" },
  student: { ar: "طالب", en: "Student" },
  guardian: { ar: "ولي أمر", en: "Guardian" },
};
