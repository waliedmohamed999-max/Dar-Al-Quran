import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, sql, submitLogin } from "./helpers";

test.describe("registration", () => {
  // Registration allows 10 attempts per hour per address; repeated test runs exceed it legitimately.
  test.beforeEach(() => sql("DELETE FROM rate_limits"));
  test("register, confirm the emailed link, and reach the student dashboard", async ({ page }) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const password = "correct-horse-battery";
    await page.goto("/register");
    await page.getByLabel("الاسم").fill("طالب من الاختبار");
    await page.locator("main").getByLabel("البريد الإلكتروني").fill(email);
    await page.getByLabel("كلمة المرور (10 أحرف على الأقل)").fill(password);
    await page.getByLabel("تأكيد كلمة المرور").fill(password);
    await page.locator("main").getByRole("checkbox", { name: /أوافق/ }).check();
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByRole("status")).toContainText("رسالة لتأكيده");

    // Sign-in is refused until the email is confirmed.
    await submitLogin(page, email, password);
    await expect(page.locator("form [role=alert]")).toContainText("تأكيد بريدك");

    const [job] = await sql<{ payload: { html: string } }>(`SELECT payload FROM jobs WHERE type = 'email.raw' AND payload->>'to' = $1 ORDER BY "createdAt" DESC LIMIT 1`, [email]);
    const link = job.payload.html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&");
    await page.goto(link);

    await submitLogin(page, email, password);
    await page.waitForURL(/\/student/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("طالب من الاختبار");
  });

  test("the library's open sign-up route is closed", async ({ request, baseURL }) => {
    const r = await request.post("/api/auth/sign-up/email", { data: { email: "x@test.invalid", password: "long-enough-pass", name: "x" }, headers: { origin: baseURL! } });
    expect(r.status()).toBe(404);
  });
  test("the same response hides whether an email is registered", async ({ request, baseURL }) => {
    const r = await request.post("/api/v1/register", { headers: { origin: baseURL! }, data: { name: "شخص", email: "student@demo.test", password: "long-enough-pass", accountType: "student", acceptTerms: true } });
    expect(r.status()).toBe(200);
  });
  test("a client cannot self-assign a staff role", async ({ request, baseURL }) => {
    const r = await request.post("/api/v1/register", { headers: { origin: baseURL! }, data: { name: "شخص", email: `x${randomUUID()}@test.invalid`, password: "long-enough-pass", accountType: "super_admin", acceptTerms: true } });
    expect(r.status()).toBe(422);
  });
});

test.describe("authorization", () => {
  test("anonymous visitors go to sign-in and get 401 from the API", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    expect((await request.get("/api/v1/me/notifications")).status()).toBe(401);
  });
  test("state changes from another origin are rejected", async ({ request }) => {
    const r = await request.post("/api/v1/contact", { headers: { origin: "https://evil.example" }, data: { name: "ab", email: "a@b.org", subject: "cd", body: "hello" } });
    expect(r.status()).toBe(403);
  });
  test("a student cannot open staff pages or call staff APIs", async ({ page, baseURL }) => {
    await login(page, "student@demo.test");
    for (const p of ["/admin", "/admin/users", "/admin/audit", "/teacher/reviews"]) expect((await page.goto(p))?.status(), p).toBe(404);
    const res = await page.request.get("/api/v1/reports/export?type=students&format=csv");
    expect(res.status()).toBe(403);
    const post = await page.request.post("/api/v1/curricula", { headers: { origin: baseURL! }, data: { name: "منهج", level: 1, direction: "REVERSE" } });
    expect(post.status()).toBe(403);
  });
  test("a teacher cannot open another teacher's student (IDOR)", async ({ page }) => {
    const [other] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student2@demo.test'`);
    const [own] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student@demo.test'`);
    await login(page, "teacher@demo.test");
    expect((await page.goto(`/teacher/students/${other.id}`))?.status()).toBe(404);
    expect((await page.goto(`/teacher/students/${own.id}`))?.status()).toBe(200);
  });
  test("a guardian opens only the linked child (IDOR)", async ({ page }) => {
    const [linked] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student3@demo.test'`);
    const [other] = await sql<{ id: string }>(`SELECT s.id FROM students s JOIN users u ON u.id = s."userId" WHERE u.email = 'student@demo.test'`);
    await login(page, "guardian@demo.test");
    expect((await page.goto(`/guardian/students/${other.id}`))?.status()).toBe(404);
    expect((await page.goto(`/guardian/students/${linked.id}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "موافقة التسجيلات الصوتية" })).toBeVisible();
    await expectAccessible(page);
  });
  test("session cookies are HttpOnly and SameSite", async ({ page, context }) => {
    await login(page, "student@demo.test");
    const c = (await context.cookies()).find((x) => x.name.includes("session_token"))!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
  });
});

test.describe("student", () => {
  test("sees the program from the brief and completes a task", async ({ page }) => {
    await login(page, "student@demo.test");
    await expect(page).toHaveURL(/\/student/);
    for (const t of ["حفظ جديد", "استماع", "تسميع", "مراجعة قريبة", "مراجعة القديم", "تجويد", "تأمل وتفسير"]) {
      await expect(page.getByRole("heading", { name: t, exact: true }).first()).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
    const before = await page.getByRole("progressbar").getAttribute("aria-valuenow");
    await page.getByRole("button", { name: "إكمال" }).first().click();
    await expect.poll(() => page.getByRole("progressbar").getAttribute("aria-valuenow")).not.toBe(before);
  });
  test("every student page renders and passes axe", async ({ page }) => {
    await login(page, "student@demo.test");
    for (const p of ["/student/plan", "/student/progress", "/student/recitations", "/student/assessments", "/student/halaqas", "/notifications", "/messages", "/account", "/mushaf/bookmarks"]) {
      expect((await page.goto(p))?.status(), p).toBe(200);
      await expectAccessible(page);
    }
  });
  test("a minor without consent sees the guardian requirement", async ({ page }) => {
    await login(page, "student3@demo.test");
    await page.goto("/student/recitations");
    await expect(page.getByText("يلزم أن يوافق ولي أمرك")).toBeVisible();
  });
});

test.describe("staff", () => {
  test("every teacher page renders and passes axe", async ({ page }) => {
    await login(page, "teacher@demo.test");
    for (const p of ["/teacher", "/teacher/reviews", "/teacher/assign", "/teacher/assessments", "/teacher/report", "/live", "/ai/referrals"]) {
      expect((await page.goto(p))?.status(), p).toBe(200);
      await expectAccessible(page);
    }
  });
  test("a teacher assigns a task and the student sees it", async ({ page }) => {
    const note = `ملاحظة-${randomUUID().slice(0, 8)}`;
    await login(page, "teacher@demo.test");
    await page.goto("/teacher/assign");
    await page.getByLabel("الطلاب").selectOption({ label: "[تجريبي] طالب أول" });
    await page.getByLabel("التاريخ").fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel("نوع المهمة").selectOption("LISTENING");
    await page.getByLabel("السورة").selectOption("112");
    await page.getByLabel("من الآية").fill("1");
    await page.getByLabel("إلى الآية").fill("4");
    await page.getByLabel("ملاحظة").fill(note);
    await page.getByRole("button", { name: "تعيين" }).click();
    await expect(page.getByText("تم تعيين المهمة")).toBeVisible();
    await login(page, "student@demo.test");
    await page.goto("/student");
    await expect(page.getByText(note)).toBeVisible();
  });
  test("every admin page renders and passes axe", async ({ page }) => {
    await login(page, "super@demo.test");
    await expect(page).toHaveURL(/\/admin/);
    for (const p of ["/admin", "/admin/users", "/admin/halaqas", "/admin/links", "/admin/curricula", "/admin/questions", "/admin/certificates", "/admin/content", "/admin/scholarly", "/admin/reports", "/admin/audit", "/admin/settings", "/admin/templates", "/admin/programs", "/admin/lessons", "/admin/ai", "/admin/site", "/live", "/ai", "/ai/referrals", "/messages"]) {
      expect((await page.goto(p))?.status(), p).toBe(200);
      await expectAccessible(page);
    }
  });
  test("exports CSV, Excel and PDF with the expected types", async ({ page }) => {
    await login(page, "admin@demo.test");
    for (const [format, type] of [["csv", "text/csv"], ["xlsx", "spreadsheet"], ["pdf", "application/pdf"]]) {
      const r = await page.request.get(`/api/v1/reports/export?type=attendance&format=${format}`);
      expect(r.status(), format).toBe(200);
      expect(r.headers()["content-type"]).toContain(type);
    }
  });
  test("the scholarly page lists text differences for specialists", async ({ page }) => {
    await login(page, "admin@demo.test");
    await page.goto("/admin/scholarly");
    await expect(page.getByText("2:181")).toBeVisible();
  });
});

test.describe("private recordings", () => {
  test("upload stores privately, the teacher listens and approves, outsiders are refused", async ({ page, baseURL }) => {
    const headers = { origin: baseURL! };
    await login(page, "student@demo.test");
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
    const form = { surahId: "111", fromAyah: "1", toAyah: "5", consent: "true", file: { name: "r.webm", mimeType: "audio/webm", buffer: webm } };
    const bad = await page.request.post("/api/v1/recitations", { headers, multipart: { ...form, file: { name: "x.webm", mimeType: "audio/webm", buffer: Buffer.from("<script>alert(1)</script>........") } } });
    expect((await bad.json()).error).toBe("unsupported_audio_type");
    const up = await page.request.post("/api/v1/recitations", { headers, multipart: form });
    expect(up.status()).toBe(200);
    const id = (await up.json()).data.id;
    const url = (await (await page.request.get(`/api/v1/recitations/${id}/audio`)).json()).data.url as string;
    expect((await page.request.get(url)).status()).toBe(200);
    // The object is not public: without the signature the store refuses it.
    expect((await page.request.get(url.split("?")[0])).status()).toBe(403);

    await login(page, "teacher2@demo.test");
    expect((await page.request.get(`/api/v1/recitations/${id}/audio`)).status()).toBe(404);
    await login(page, "guardian@demo.test");
    expect((await page.request.get(`/api/v1/recitations/${id}/audio`)).status()).toBe(404);

    await login(page, "teacher@demo.test");
    expect((await page.request.get(`/api/v1/recitations/${id}/audio`)).status()).toBe(200);
    const review = await page.request.post(`/api/v1/recitations/${id}/review`, { headers, data: { memorizationScore: 5, tajweedScore: 4, fluencyScore: 4, revisionScore: 4, decision: "APPROVED", mistakes: [] } });
    expect(review.status()).toBe(200);
    await login(page, "student@demo.test");
    await page.goto("/student/recitations");
    await expect(page.getByText("معتمد").first()).toBeVisible();
    expect((await page.request.delete(`/api/v1/recitations/${id}`, { headers })).status()).toBe(200);
  });
});
