import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/lib/crypto";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { sanitizeBody, toPlainText } from "@/lib/sanitize";
import { sniffAudio } from "@/lib/storage";
import { registerSchema } from "@/modules/people/service";
import { scoreAttempt } from "@/modules/assessments/service";
import { csvCell, toCsv, visualOrder } from "@/modules/reports/service";
import { render } from "@/modules/notifications/service";

describe("sanitizer", () => {
  it("removes scripts and event handlers", () => {
    const out = sanitizeBody('<p onclick="x()">a</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="x">');
    expect(out).not.toMatch(/script|onclick|onerror|javascript/);
    expect(out).toContain("<p>a</p>");
  });
  it("adds rel to links and blocks non-https schemes", () => {
    expect(sanitizeBody('<a href="https://x.org">x</a>')).toContain('rel="noopener noreferrer"');
    expect(sanitizeBody('<a href="http://x.org">x</a>')).not.toContain("http://");
  });
  it("reduces provider tafsir to text", () => {
    expect(toPlainText('<span class="g">(الله)</span>  علم')).toBe("(الله) علم");
  });
});

describe("audio validation uses content, not the claimed type", () => {
  const pad = (b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);
  it("recognizes real audio signatures", () => {
    expect(sniffAudio(pad([0x1a, 0x45, 0xdf, 0xa3]))).toBe("audio/webm");
    expect(sniffAudio(Buffer.concat([Buffer.from("OggS"), Buffer.alloc(16)]))).toBe("audio/ogg");
    expect(sniffAudio(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(16)]))).toBe("audio/mpeg");
  });
  it("rejects HTML, executables and tiny files", () => {
    expect(sniffAudio(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(sniffAudio(pad([0x4d, 0x5a]))).toBeNull();
    expect(sniffAudio(Buffer.from("ab"))).toBeNull();
  });
});

describe("field encryption", () => {
  beforeAll(() => { process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
  it("round-trips and uses a fresh IV", () => {
    const a = encryptField("https://meet.example/x");
    expect(a).not.toContain("meet");
    expect(a).not.toBe(encryptField("https://meet.example/x"));
    expect(decryptField(a)).toBe("https://meet.example/x");
  });
  it("detects tampering", () => {
    const [iv, tag, body] = encryptField("secret").split(".");
    const bad = Buffer.from(body, "base64");
    bad[0] ^= 1;
    expect(() => decryptField([iv, tag, bad.toString("base64")].join("."))).toThrow();
  });
});

describe("exports", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell('a"b,c')).toBe('"a""b,c"');
    expect(csvCell(null)).toBe("");
  });
  it("starts CSV with a BOM so Excel reads Arabic correctly", () => {
    expect(toCsv({ title: "x", columns: ["a"], rows: [[1]] }).charCodeAt(0)).toBe(0xfeff);
  });
  it("reorders Arabic for PDF output", () => {
    expect(visualOrder("سلام")).toBe("مالس");
  });
});

describe("role definitions", () => {
  it("only lets admins approve certificates", () => {
    expect(ROLE_PERMISSIONS.teacher).not.toContain("certificates.approve");
    expect(ROLE_PERMISSIONS.supervisor).not.toContain("certificates.approve");
    expect(ROLE_PERMISSIONS.admin).toContain("certificates.approve");
  });
  it("reserves role assignment for the super admin", () => {
    expect(ROLE_PERMISSIONS.admin).not.toContain("roles.assign");
    expect(ROLE_PERMISSIONS.super_admin).toContain("roles.assign");
  });
  it("gives students and guardians no staff permissions", () => {
    for (const r of [ROLE_PERMISSIONS.student, ROLE_PERMISSIONS.guardian]) {
      expect(r).not.toContain("students.view_all");
      expect(r).not.toContain("reviews.write");
    }
  });
});

describe("registration validation", () => {
  const ok = { name: "طالب", email: "a@b.org", password: "longenough1", accountType: "student", acceptTerms: true };
  it("accepts student and guardian", () => {
    expect(registerSchema.safeParse(ok).success).toBe(true);
    expect(registerSchema.safeParse({ ...ok, accountType: "guardian" }).success).toBe(true);
  });
  it("cannot self-register a staff role", () => {
    for (const accountType of ["teacher", "admin", "super_admin"]) expect(registerSchema.safeParse({ ...ok, accountType }).success).toBe(false);
  });
  it("needs terms acceptance and a long password", () => {
    expect(registerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });
});

describe("assessment scoring", () => {
  it("waits for a teacher when practical answers are ungraded", () => {
    expect(scoreAttempt([{ points: 1, ratio: 1 }, { points: 1, ratio: null }]).pending).toBe(true);
  });
  it("weights by points", () => {
    expect(scoreAttempt([{ points: 3, ratio: 1 }, { points: 1, ratio: 0 }])).toEqual({ pending: false, percent: 75 });
  });
});

describe("notification rendering", () => {
  it("fills known variables and leaves unknown ones visible", () => {
    expect(render("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});
