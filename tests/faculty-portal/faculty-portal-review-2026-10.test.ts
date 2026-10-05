import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("faculty-portal review 2026-10 — grades", () => {
  const src = read("src/components/portal/FacultyGradesManager.tsx");

  it("never inserts a grade directly as 'submitted' (sg_insert only allows draft)", () => {
    expect(src).not.toMatch(/status:\s*submit\s*\?\s*"submitted"/);
    expect(src).toContain('status: "draft"');
  });

  it("does not submit anything if a draft write failed", () => {
    const failIdx = src.indexOf("draftResults.some((r: any) => r.error)");
    const submitIdx = src.indexOf('.update({ status: "submitted" })');
    expect(failIdx).toBeGreaterThan(0);
    expect(submitIdx).toBeGreaterThan(failIdx);
  });

  it("refuses to delete a component that has submitted/approved grades", () => {
    expect(src).toContain('g.grade_component_id === id && g.status !== "draft"');
  });
});

describe("faculty-portal review 2026-10 — request inbox fails closed", () => {
  const src = read("src/lib/student-requests/staff-inbox.functions.ts");

  it("legacy service-role readers are admin-only", () => {
    expect(src).toContain("async function canUseLegacyAdminFallback");
    for (const reader of ["await fetchLegacyInboxItems()", "await fetchLegacyRequestDetail(data.requestId)"]) {
      const readerIdx = src.indexOf(reader);
      const guardIdx = src.lastIndexOf("canUseLegacyAdminFallback(context.userId)", readerIdx);
      expect(readerIdx).toBeGreaterThan(0);
      expect(guardIdx).toBeGreaterThan(0);
      expect(readerIdx - guardIdx).toBeLessThan(1500);
    }
  });
});

describe("faculty-portal review 2026-10 — graduation project downloads", () => {
  const fn = read("src/lib/graduation-projects/download.functions.ts");
  const adapter = read("src/routes/-graduation-projects-adapter.ts");

  it("authorizes with the caller's session BEFORE signing with the service role", () => {
    const authIdx = fn.indexOf("rpc.createSignedDownload(");
    const signIdx = fn.indexOf("supabaseAdmin.storage");
    expect(fn).toContain("new GraduationProjectsRpcClient(context.supabase");
    expect(authIdx).toBeGreaterThan(0);
    expect(signIdx).toBeGreaterThan(authIdx);
    expect(fn).toContain(".middleware([requireSupabaseAuth])");
    expect(fn).toContain('path.includes("..")');
  });

  it("the UI downloads through the server function, never a public URL", () => {
    expect(adapter).toContain("signGraduationProjectDownloadFn");
    expect(adapter).not.toMatch(/getPublicUrl|publicUrl/);
  });
});

describe("faculty-portal review 2026-10 — portal guard", () => {
  const src = read("src/routes/faculty-portal.tsx");

  it("blocks disabled faculty and does not sign out on a transient read error", () => {
    expect(src).toContain('select("must_change_password, status")');
    expect(src).toContain("DISABLED_FACULTY_STATUSES");
    const errIdx = src.indexOf("if (profileError)");
    const signOutIdx = src.indexOf("supabase.auth.signOut()");
    expect(errIdx).toBeGreaterThan(0);
    expect(signOutIdx).toBeGreaterThan(errIdx);
  });
});

describe("faculty-portal review 2026-10 — materials", () => {
  const src = read("src/lib/faculty-materials.functions.ts");

  it("rejects disabled faculty server-side", () => {
    expect(src).toContain('["inactive", "suspended", "disabled"]');
  });

  it("cannot republish archived material", () => {
    const publish = src.slice(src.indexOf("export const publishCourseMaterial"));
    expect(publish.slice(0, 800)).toContain('owned.status === "archived"');
  });

  it("bounds the base64 payload before decoding", () => {
    expect(src).toMatch(/fileBase64: z\.string\(\)\.min\(1\)\.max\(/);
  });
});

describe("faculty-portal review 2026-10 — lecture execution validation", () => {
  const src = read("src/lib/lecture-execution.functions.ts");

  it("every server function validates its input with zod", () => {
    expect(src).not.toMatch(/inputValidator\(\(input: [^)]*\) => input\)/);
    expect(src).toContain("recordExecutionSchema.parse(input)");
    expect(src).toContain("z.string().uuid()");
    expect(src).toContain("notInFuture");
  });
});

describe("faculty-portal review 2026-10 — student data", () => {
  const src = read("src/lib/academic-status.functions.ts");

  it("audit records who viewed a student's progress", () => {
    expect(src).toContain("actor_user_id: actorUserId ?? null");
    expect(src).toMatch(/audit\("student_progress_viewed", [^;]*, userId\)/);
  });

  it("search input cannot inject PostgREST filter syntax", () => {
    const sanitize = (raw: string) => raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
    expect(src).toContain("data.query.replace(/[,()*%\\\\]/g");
    expect(sanitize("123,status.eq.graduated")).not.toContain(",");
    expect(sanitize("a)or(b")).toBe("a or b");
  });
});

describe("faculty-portal review 2026-10 — reports & councils", () => {
  it("department teaching load is filtered in the database (no silent truncation)", () => {
    const all = read("src/lib/beneficiary-reports.functions.ts");
    const start = all.indexOf("async function loadDepartmentScopedCounts");
    const src = all.slice(start, start + 2500);
    expect(start).toBeGreaterThan(0);
    expect(src).not.toContain(".limit(5000)");
    expect(src).toContain('courses!inner(department_id, credit_hours, code)');
  });

  it("council authorization audit returns only the caller's councils unless privileged", () => {
    const src = read("src/lib/councils-authorization-audit.functions.ts");
    expect(src).toContain("officerCouncilIds.has(r.councilId)");
    expect(src).toContain("councils: visibleResults");
  });

  it("topic attachments go through the narrow RPC first", () => {
    const src = read("src/lib/faculty-councils.functions.ts");
    expect(src).toContain('rpc("create_council_topic_attachment"');
  });
});

describe("faculty-portal review 2026-10 — migration drafts are drafts", () => {
  for (const f of [
    "docs/migration-drafts/FACULTY-GRADE-INTEGRITY-01.sql",
    "docs/migration-drafts/COUNCILS-FACULTY-REVIEW-FIXES-01.sql",
    "docs/migration-drafts/COUNCIL-VOTE-SECRECY-OPTIONAL-01.sql",
  ]) {
    it(`${f} is marked DRAFT ONLY and wrapped in a transaction`, () => {
      const sql = read(f);
      expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
      expect(sql).toContain("BEGIN;");
      expect(sql).toContain("COMMIT;");
    });
  }

  it("vote summary draft orders by an existing column", () => {
    const sql = read("docs/migration-drafts/COUNCILS-FACULTY-REVIEW-FIXES-01.sql");
    expect(sql).toContain("ORDER BY r.calculated_at DESC");
    expect(sql).not.toContain("ORDER BY r.created_at");
  });
});

describe("faculty dashboard — render safety", () => {
  it("does not reference an undefined session variable in the profile header", () => {
    const src = readFileSync(join(import.meta.dir, "../..", "src/routes/faculty-portal.index.tsx"), "utf8");
    // A stray `{(s.programName || s.levelName) && …}` block outside any loop
    // threw ReferenceError and took the whole dashboard down (2026-10-05).
    expect(src).not.toMatch(/\bs\.(programName|levelName)\b/);
  });
});
