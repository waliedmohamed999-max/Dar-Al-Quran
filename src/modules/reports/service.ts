import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import PDFDocument from "pdfkit";
import bidiFactory from "bidi-js";
import { audit } from "@/lib/audit";
import { withActor } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { writeXlsx } from "./xlsx";

export const reportFilter = z.object({
  type: z.enum(["students", "attendance", "tasks", "reviews"]),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  halaqaId: z.string().optional(),
  teacherId: z.string().optional(),
});
export type ReportFilter = z.infer<typeof reportFilter>;
export type Table = { title: string; columns: string[]; rows: (string | number | null)[][] };

const range = (f: ReportFilter) => (f.from || f.to ? { gte: f.from, lte: f.to } : undefined);

/** All reads run through RLS, so a report can only contain rows the actor may see. */
export async function buildReport(actor: Actor, f: ReportFilter): Promise<Table> {
  if (!actor.perms.has("reports.view")) throw forbidden();
  return withActor(actor, async (tx) => {
    const enrolled = f.halaqaId || f.teacherId
      ? { enrollments: { some: { status: "ACTIVE" as const, ...(f.halaqaId ? { halaqaId: f.halaqaId } : {}), ...(f.teacherId ? { halaqa: { teacherId: f.teacherId } } : {}) } } }
      : {};
    const studentWhere = { ...enrolled };
    if (f.type === "students") {
      const rows = await tx.student.findMany({
        where: studentWhere,
        take: 5000,
        include: { user: { select: { name: true } }, memorizations: { where: { status: "APPROVED" }, select: { fromAyah: true, toAyah: true } } },
      });
      return {
        title: "Students",
        columns: ["Student", "Level", "Approved ayahs (segments sum)"],
        rows: rows.map((s) => [s.user.name, s.level, s.memorizations.reduce((n, m) => n + m.toAyah - m.fromAyah + 1, 0)]),
      };
    }
    if (f.type === "attendance") {
      const rows = await tx.attendance.findMany({
        where: { student: studentWhere, recordedAt: range(f) },
        take: 20000,
        orderBy: { recordedAt: "desc" },
        include: { student: { select: { user: { select: { name: true } } } }, session: { select: { startsAt: true, halaqa: { select: { name: true } } } } },
      });
      return {
        title: "Attendance",
        columns: ["Date", "Halaqa", "Student", "Status"],
        rows: rows.map((a) => [a.session.startsAt.toISOString().slice(0, 10), a.session.halaqa.name, a.student.user.name, a.status]),
      };
    }
    if (f.type === "tasks") {
      const rows = await tx.dailyTask.findMany({
        where: { student: studentWhere, date: range(f) },
        take: 20000,
        orderBy: { date: "desc" },
        include: { student: { select: { user: { select: { name: true } } } } },
      });
      return {
        title: "Tasks",
        columns: ["Date", "Student", "Type", "Surah", "From", "To", "Status"],
        rows: rows.map((t) => [t.date.toISOString().slice(0, 10), t.student.user.name, t.type, t.surahId, t.fromAyah, t.toAyah, t.status]),
      };
    }
    const rows = await tx.teacherReview.findMany({
      where: { student: studentWhere, createdAt: range(f), ...(f.teacherId ? { teacherId: f.teacherId } : {}) },
      take: 20000,
      orderBy: { createdAt: "desc" },
      include: { student: { select: { user: { select: { name: true } } } } },
    });
    return {
      title: "Reviews",
      columns: ["Date", "Student", "Memorization", "Tajweed", "Fluency", "Revision", "Decision"],
      rows: rows.map((r) => [r.createdAt.toISOString().slice(0, 10), r.student.user.name, r.memorizationScore, r.tajweedScore, r.fluencyScore, r.revisionScore, r.decision]),
    };
  });
}

/** Neutralizes spreadsheet formula injection by prefixing risky leading characters. */
export function csvCell(v: string | number | null): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (t: Table) => "﻿" + [t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

export const toXlsx = async (t: Table): Promise<Buffer> => writeXlsx(t.title, t.columns, t.rows);

const bidi = bidiFactory();
/** pdfkit shapes Arabic but does not reorder it, so this applies the Unicode bidi algorithm first. */
export function visualOrder(text: string): string {
  const levels = bidi.getEmbeddingLevels(text, "rtl");
  const chars = text.split("");
  for (const [start, end] of bidi.getReorderSegments(text, levels)) {
    const part = chars.slice(start, end + 1).reverse();
    chars.splice(start, end - start + 1, ...part);
  }
  return chars.join("");
}

export function toPdf(t: Table): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, font: join(process.cwd(), "assets/fonts/NotoNaskhArabic-Regular.ttf") });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 72;
    const colW = width / t.columns.length;
    const write = (row: (string | number | null)[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      row.forEach((c, i) => {
        // First column on the right, matching the Arabic reading direction.
        const x = 36 + width - colW * (i + 1);
        doc.fontSize(bold ? 11 : 10).text(visualOrder(String(c ?? "")), x, y, { width: colW - 6, align: "right", lineBreak: false, features: ["rlig", "liga", "calt"] });
      });
      doc.y = y + 18;
    };
    doc.fontSize(15).text(visualOrder(`دار القرآن الكريم - ${t.title}`), { align: "right" });
    doc.moveDown();
    write(t.columns, true);
    t.rows.forEach((r) => write(r));
    doc.end();
  });
}

export async function exportReport(actor: Actor, f: ReportFilter, format: "csv" | "xlsx" | "pdf") {
  if (!actor.perms.has("reports.export")) throw forbidden();
  const t = await buildReport(actor, f);
  await audit(actor.id, "report.export", "Report", f.type, { format, rows: t.rows.length });
  const name = `${f.type}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "csv") return new Response(toCsv(t), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  if (format === "xlsx") return new Response(new Uint8Array(await toXlsx(t)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  return new Response(new Uint8Array(await toPdf(t)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
}

/** Rates are computed from records only. */
export const adminDashboard = (actor: Actor) =>
  withActor(actor, async (tx) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const [students, active, teachers, halaqas, att, tasks, reviews, pendingCerts, certs, pendingEnroll, pendingLinks] = await Promise.all([
      tx.student.count(),
      tx.student.count({ where: { tasks: { some: { date: { gte: since }, status: "DONE" } } } }),
      tx.teacher.count(),
      tx.halaqa.count({ where: { active: true } }),
      tx.attendance.groupBy({ by: ["status"], where: { recordedAt: { gte: since } }, _count: true }),
      tx.dailyTask.groupBy({ by: ["status"], where: { date: { gte: since } }, _count: true }),
      tx.teacherReview.aggregate({ where: { createdAt: { gte: since } }, _avg: { memorizationScore: true, tajweedScore: true, fluencyScore: true, revisionScore: true }, _count: true }),
      tx.certificate.count({ where: { status: "PENDING_APPROVAL" } }),
      tx.certificate.count({ where: { status: "ISSUED" } }),
      tx.enrollment.count({ where: { status: "PENDING" } }),
      tx.guardianStudentLink.count({ where: { status: "PENDING" } }),
    ]);
    const count = (g: { status: string; _count: number }[], ...s: string[]) => g.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
    const attendanceHeld = count(att, "PRESENT", "LATE", "ABSENT");
    const taskCounted = count(tasks, "PENDING", "IN_PROGRESS", "DONE", "SKIPPED");
    return {
      students, active, teachers, halaqas, certs, pendingCerts, pendingEnroll, pendingLinks,
      attendancePercent: attendanceHeld ? Math.round((count(att, "PRESENT", "LATE") / attendanceHeld) * 100) : null,
      tasksPercent: taskCounted ? Math.round((count(tasks, "DONE") / taskCounted) * 100) : null,
      reviews,
    };
  });

/** One row per halaqa, from records, for the central dashboard. */
export const halaqaPerformance = (actor: Actor) =>
  withActor(actor, async (tx) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const halaqas = await tx.halaqa.findMany({ where: { active: true }, select: { id: true, name: true, capacity: true, enrollments: { where: { status: "ACTIVE" }, select: { studentId: true } } } });
    const rows = [];
    for (const h of halaqas) {
      const ids = h.enrollments.map((e) => e.studentId);
      const [att, tasks, avg] = await Promise.all([
        tx.attendance.groupBy({ by: ["status"], where: { session: { halaqaId: h.id }, recordedAt: { gte: since } }, _count: true }),
        tx.dailyTask.groupBy({ by: ["status"], where: { studentId: { in: ids }, date: { gte: since } }, _count: true }),
        tx.teacherReview.aggregate({ where: { studentId: { in: ids }, createdAt: { gte: since } }, _avg: { memorizationScore: true } }),
      ]);
      const c = (g: { status: string; _count: number }[], ...s: string[]) => g.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
      const held = c(att, "PRESENT", "LATE", "ABSENT");
      const counted = c(tasks, "PENDING", "IN_PROGRESS", "DONE", "SKIPPED");
      rows.push({ id: h.id, name: h.name, members: ids.length, capacity: h.capacity, attendance: held ? Math.round((c(att, "PRESENT", "LATE") / held) * 100) : null, tasks: counted ? Math.round((c(tasks, "DONE") / counted) * 100) : null, memorization: avg._avg.memorizationScore });
    }
    return rows;
  });

/** Alerts teachers early: repeated absence, or several unfinished tasks in the last 14 days. */
export const strugglingStudents = (actor: Actor) =>
  withActor(actor, async (tx) => {
    const since = new Date(Date.now() - 14 * 86400000);
    const ids = await tx.enrollment.findMany({
      where: { status: "ACTIVE", halaqa: { teacherId: actor.teacherId ?? undefined } },
      select: { studentId: true, student: { select: { user: { select: { name: true } } } } },
    });
    const out = [];
    for (const { studentId, student } of ids) {
      const [absent, open] = await Promise.all([
        tx.attendance.count({ where: { studentId, status: "ABSENT", recordedAt: { gte: since } } }),
        tx.dailyTask.count({ where: { studentId, status: { in: ["PENDING", "IN_PROGRESS"] }, date: { gte: since, lt: new Date() } } }),
      ]);
      if (absent >= 2 || open >= 5) out.push({ studentId, name: student.user.name, absent, open });
    }
    return out;
  });

export const readFontExists = () => {
  readFileSync(join(process.cwd(), "assets/fonts/NotoNaskhArabic-Regular.ttf"));
  return true;
};
