// Dashboard navigation. Computed on the server from the actor's permissions, so a link appears only
// when its page would open. Items are plain data: the client maps `icon` to a component.
import type { Actor } from "@/lib/session";

export type NavIcon = "home" | "users" | "circle" | "link" | "programs" | "book" | "level" | "tasks" | "tajweed" | "hadith" | "questions" | "exam" | "judge" | "cert" | "report" | "content" | "review" | "mushaf" | "adhkar" | "site" | "ai" | "live" | "bell" | "template" | "audit" | "settings" | "map" | "message" | "account" | "children" | "recite" | "study";
export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { id: string; title: string; items: NavItem[] };

export function dashNav(a: Actor, t: (ar: string, en: string) => string): NavGroup[] {
  const has = (p: Parameters<typeof a.perms.has>[0]) => a.perms.has(p);
  const staff = a.roles.some((r) => ["super_admin", "admin", "supervisor"].includes(r.key));
  const seesAll = has("students.view_all");
  const groups: NavGroup[] = [];
  const add = (id: string, title: string, items: (NavItem | false | null)[]) => {
    const list = items.filter(Boolean) as NavItem[];
    if (list.length) groups.push({ id, title, items: list });
  };

  if (a.studentId) add("student", t("رحلتي", "My journey"), [
    { href: "/student", label: t("وردي اليوم", "Today's program"), icon: "home" },
    { href: "/student/plan", label: t("خطتي", "My plan"), icon: "tasks" },
    { href: "/student/map", label: t("خريطة الحفظ", "Memorization map"), icon: "map" },
    { href: "/student/recitations", label: t("التسميع", "Recitations"), icon: "recite" },
    { href: "/hadith/my", label: t("حفظ الحديث", "Hadith"), icon: "hadith" },
    { href: "/student/placement", label: t("تحديد المستوى", "Placement"), icon: "level" },
    { href: "/student/assessments", label: t("الاختبارات", "Assessments"), icon: "exam" },
    { href: "/student/halaqas", label: t("الحلقات", "Halaqas"), icon: "circle" },
    { href: "/reports/me", label: t("تقريري", "My report"), icon: "report" },
    { href: "/live", label: t("الفصول المباشرة", "Live classes"), icon: "live" },
  ]);
  if (a.teacherId) add("teacher", t("عملي", "My work"), [
    { href: "/teacher", label: t("طلابي وحلقاتي", "Students and halaqas"), icon: "home" },
    { href: "/teacher/reviews", label: t("تقييم التسميع", "Review recitations"), icon: "recite" },
    { href: "/teacher/assign", label: t("تعيين الورد", "Assign tasks"), icon: "tasks" },
    { href: "/teacher/hadith", label: t("الأحاديث", "Hadith"), icon: "hadith" },
    { href: "/teacher/placement", label: t("تقييم المستوى", "Placement reviews"), icon: "level" },
    { href: "/teacher/assessments", label: t("الاختبارات", "Assessments"), icon: "exam" },
    { href: "/judging", label: t("جلسات التحكيم", "Judging sessions"), icon: "judge" },
    { href: "/teacher/report", label: t("تقارير الطلاب", "Student reports"), icon: "report" },
    { href: "/live", label: t("الفصول المباشرة", "Live classes"), icon: "live" },
    { href: "/ai/referrals", label: t("الأسئلة المحالة", "Referred questions"), icon: "ai" },
  ]);
  if (a.guardianId) add("guardian", t("الأبناء", "My children"), [{ href: "/guardian", label: t("أبنائي", "My children"), icon: "children" }]);

  if (staff) {
    add("general", t("الإدارة العامة", "General"), [
      has("reports.view") && { href: "/admin", label: t("لوحة المعلومات", "Dashboard"), icon: "home" },
      has("users.manage") && { href: "/admin/users", label: t("المستخدمون", "Users"), icon: "users" },
      has("halaqas.manage") && { href: "/admin/halaqas", label: t("الحلقات والانتساب", "Halaqas and enrollment"), icon: "circle" },
      has("guardians.link") && { href: "/admin/links", label: t("ربط أولياء الأمور", "Guardian links"), icon: "link" },
    ]);
    add("learning", t("إدارة التعليم", "Learning"), [
      has("content.manage") && { href: "/admin/programs", label: t("البرامج التعليمية", "Programs"), icon: "programs" },
      has("plans.manage") && seesAll && { href: "/admin/curricula", label: t("المناهج", "Curricula"), icon: "book" },
      has("reviews.write") && seesAll && { href: "/teacher/placement", label: t("تحديد المستوى", "Placement"), icon: "level" },
      has("content.manage") && { href: "/admin/lessons", label: t("دروس التجويد", "Tajweed lessons"), icon: "tajweed" },
      has("content.manage") && { href: "/admin/hadith", label: t("مصادر الأحاديث", "Hadith sources"), icon: "hadith" },
      has("content.manage") && { href: "/admin/study-resources", label: t("موارد الدراسة", "Study resources"), icon: "study" },
    ]);
    add("assess", t("الاختبارات والتقييم", "Assessment"), [
      has("assessments.manage") && seesAll && { href: "/admin/questions", label: t("بنك الأسئلة", "Question bank"), icon: "questions" },
      has("assessments.manage") && seesAll && { href: "/admin/competitions", label: t("الاختبارات والمسابقات", "Exams and competitions"), icon: "exam" },
      has("assessments.manage") && seesAll && { href: "/admin/judging", label: t("التحكيم الشفهي", "Oral judging"), icon: "judge" },
      has("certificates.request") && seesAll && { href: "/admin/certificates", label: t("الشهادات", "Certificates"), icon: "cert" },
      has("reports.view") && seesAll && { href: "/admin/reports", label: t("التقارير", "Reports"), icon: "report" },
    ]);
    add("content", t("المحتوى", "Content"), [
      has("content.manage") && { href: "/admin/content", label: t("إدارة المحتوى", "Content"), icon: "content" },
      has("scholarly.review") && { href: "/admin/scholarly", label: t("المراجعة العلمية", "Scholarly review"), icon: "review" },
      { href: "/mushaf", label: t("المصحف والتفسير", "Mushaf and tafsir"), icon: "mushaf" },
      has("content.manage") && { href: "/admin/adhkar", label: t("الأذكار", "Adhkar"), icon: "adhkar" },
      has("settings.manage") && { href: "/admin/site", label: t("الموقع العام", "Public site"), icon: "site" },
    ]);
    add("platform", t("إدارة المنصة", "Platform"), [
      has("ai.manage") && { href: "/admin/ai", label: t("المعلم الذكي", "AI teacher"), icon: "ai" },
      has("halaqas.manage") && !a.teacherId && { href: "/live", label: t("الفصول المباشرة", "Live classes"), icon: "live" },
      has("notifications.manage") && { href: "/admin/templates", label: t("قوالب الإشعارات", "Notification templates"), icon: "template" },
      has("audit.view") && { href: "/admin/audit", label: t("سجل التدقيق", "Audit log"), icon: "audit" },
      has("settings.manage") && { href: "/admin/settings", label: t("الإعدادات", "Settings"), icon: "settings" },
    ]);
  }
  add("account", t("حسابي", "Account"), [
    { href: "/notifications", label: t("الإشعارات", "Notifications"), icon: "bell" },
    { href: "/messages", label: t("الرسائل", "Messages"), icon: "message" },
    { href: "/adhkar/settings", label: t("تذكيرات الأذكار", "Adhkar reminders"), icon: "adhkar" },
    { href: "/account", label: t("الحساب والخصوصية", "Account and privacy"), icon: "account" },
    { href: "/ai", label: t("المعلم الذكي", "AI teacher"), icon: "ai" },
    !a.studentId && !staff && { href: "/mushaf", label: t("المصحف", "Mushaf"), icon: "mushaf" },
  ]);
  return groups;
}
