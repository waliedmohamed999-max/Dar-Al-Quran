import nodemailer from "nodemailer";
import { integrations, env } from "./env";

export async function sendMail(to: string, subject: string, html: string) {
  if (!integrations.email) {
    if (env.isProd) throw new Error("SMTP is not configured");
    console.warn("[mail] SMTP not configured, email dropped", { subject });
    return;
  }
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await t.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}
