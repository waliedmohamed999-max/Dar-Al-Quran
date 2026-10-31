import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { systemDb } from "./db";
import { env } from "./env";

async function enqueueMail(to: string, subject: string, link: string) {
  await systemDb().job.create({
    data: { type: "email.raw", payload: { to, subject, html: `<div dir="rtl" style="font-family:sans-serif"><p>${subject}</p><p><a href="${link}">${link}</a></p></div>` } },
  });
}

export const auth = betterAuth({
  baseURL: env.appUrl,
  secret: env.authSecret,
  database: prismaAdapter(systemDb(), { provider: "postgresql" }),
  session: { modelName: "authSession", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 15 },
  account: { modelName: "authAccount" },
  advanced: {
    useSecureCookies: env.appUrl.startsWith("https://"),
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => enqueueMail(user.email, "استعادة كلمة المرور | Password reset", url),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => enqueueMail(user.email, "تأكيد البريد الإلكتروني | Confirm your email", url),
  },
  rateLimit: { enabled: true, window: 60, max: 20 },
  appName: "Dar Al-Quran",
  plugins: [twoFactor({ issuer: "Dar Al-Quran" }), nextCookies()],
});
