import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * LEARNING-MATERIALS-SECURE-ACTIVATION-01 — text-level contract guards.
 *
 * Mirrors the project's established pattern (read the SQL draft + runtime
 * sources and assert security invariants). Executable DB-level checks live in
 * postgres-secure-activation-verifier.sql (PG17, disposable cluster).
 */

const draftSql = readFileSync(
  new URL("../../docs/drafts/20260721000000_materials_secure_activation.draft.sql", import.meta.url),
  "utf8",
);
const facultyRuntime = readFileSync(
  new URL("../../src/lib/faculty-materials.functions.ts", import.meta.url),
  "utf8",
);
const studentRuntime = readFileSync(
  new URL("../../src/lib/student-materials.functions.ts", import.meta.url),
  "utf8",
);
const portalFeatures = readFileSync(
  new URL("../../src/lib/portal-features.ts", import.meta.url),
  "utf8",
);

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("secure-activation SQL draft (DRAFT ONLY)", () => {
  test("is marked as a never-applied forward draft", () => {
    expect(draftSql).toContain("FORWARD DRAFT ONLY. NEVER APPLY FROM THIS PR.");
  });

  test("defines exactly the three RPCs the atomic cutover requires (exact signatures)", () => {
    expect(draftSql).toContain("create or replace function public.faculty_reserve_course_material_upload(");
    expect(draftSql).toContain("create or replace function public.faculty_finalize_course_material_upload(");
    expect(draftSql).toContain("create or replace function public.record_course_material_download(");
    // Exact regprocedure signatures the cutover resolves:
    expect(countOccurrences(draftSql, "public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)")).toBeGreaterThanOrEqual(2);
    expect(countOccurrences(draftSql, "public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)")).toBeGreaterThanOrEqual(2);
    expect(countOccurrences(draftSql, "public.record_course_material_download(uuid,uuid)")).toBeGreaterThanOrEqual(2);
  });

  test("all four functions are security definer with pinned search_path", () => {
    expect(countOccurrences(draftSql, "security definer set search_path = public, pg_temp")).toBe(4);
  });

  test("execute ACLs: cutover RPCs authenticated-only; scanner service_role-only", () => {
    expect(countOccurrences(draftSql, "from public, anon, service_role")).toBe(3);
    expect(countOccurrences(draftSql, "to authenticated")).toBe(3);
    expect(countOccurrences(draftSql, "from public, anon, authenticated")).toBe(1);
    expect(countOccurrences(draftSql, "to service_role")).toBe(1);
  });

  test("scan lifecycle is fail-closed and terminal", () => {
    expect(draftSql).toContain("scan_state text not null default 'pending'");
    expect(draftSql).toContain("check (scan_state in ('pending','clean','infected','failed'))");
    expect(draftSql).toContain("if v_file.scan_state <> 'clean'");
    expect(draftSql).toContain("FILE_NOT_CLEAN");
    expect(draftSql).toContain("INVALID_SCAN_TRANSITION");
    expect(draftSql).toContain("if v_file.scan_state <> 'pending'");
  });

  test("week linkage is bounded 1..20 and nullable", () => {
    expect(draftSql).toContain("add column if not exists week_number integer");
    expect(draftSql).toContain("check (week_number is null or (week_number between 1 and 20))");
  });

  test("event vocabulary gains file_scanned only", () => {
    expect(draftSql).toContain(
      "check (event in ('created','file_uploaded','published','updated','archived','downloaded','file_scanned'))",
    );
  });

  test("closed-write guards are present", () => {
    for (const code of [
      "AUTHORIZATION_DENIED",
      "CURRENT_ACTIVE_SECTION_REQUIRED",
      "ARCHIVED_MATERIAL_IMMUTABLE",
      "IDEMPOTENCY_KEY_REUSE",
      "UPLOAD_FINALIZE_MISMATCH",
      "INVALID_MIME_TYPE",
      "INVALID_FILE_EXTENSION",
      "INVALID_FILE_SIZE",
    ]) {
      expect(draftSql).toContain(code);
    }
  });

  test("conservative baseline is compiled in (25MB + 5 types), settings only narrow", () => {
    expect(draftSql).toContain("c_max_bytes constant bigint := 25 * 1024 * 1024");
    expect(draftSql).toContain("'application/vnd.openxmlformats-officedocument.presentationml.presentation'");
    expect(draftSql).toContain("c_allowed_ext constant text[] := array['pdf','doc','docx','ppt','pptx']");
    expect(draftSql).toContain("materials_allowed_mime_types");
    expect(draftSql).toContain("materials_allowed_extensions");
  });

  test("no storage bucket creation and no storage policy changes (pending approval)", () => {
    // Strip line comments so header documentation cannot trip the guard.
    const executable = draftSql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(executable).not.toContain("storage.buckets");
    expect(executable).not.toContain("storage.objects");
    expect(executable).not.toContain("create policy");
    expect(executable).not.toContain("create bucket");
    expect(executable).not.toContain("storage_create_bucket");
  });

  test("idempotency index matches the atomic draft (composable)", () => {
    expect(draftSql).toContain("create unique index if not exists uq_material_events_actor_idempotency");
  });
});

describe("runtime fail-closed contracts", () => {
  test("student download path gates on scan_state = clean for everyone", () => {
    expect(studentRuntime).toContain("isMaterialFileDownloadable");
    expect(studentRuntime).toContain("scan_state");
    expect(studentRuntime).toContain("الملف غير متاح بعد (قيد الفحص أو غير آمن)");
    expect(countOccurrences(studentRuntime, "isMaterialFileDownloadable")).toBeGreaterThanOrEqual(2);
  });

  test("student listings hide non-clean files", () => {
    expect(studentRuntime).toContain(
      "files: (m.files ?? []).filter((f) => isMaterialFileDownloadable(f?.scan_state))",
    );
  });

  test("faculty upload enforces the resolved narrow-only policy and gates scan state", () => {
    expect(facultyRuntime).toContain("resolveMaterialsUploadPolicy");
    expect(facultyRuntime).toContain("MATERIALS_SETTINGS_KEYS");
    expect(facultyRuntime).toContain("getEffectiveMaterialsUploadPolicy");
    expect(facultyRuntime).toContain("policy.allowedMimeTypes");
    expect(facultyRuntime).toContain("policy.allowedExtensions");
    expect(facultyRuntime).toContain("policy.maxBytes");
    // Fail-closed signature gate replaces the permanently-pending placeholder.
    expect(facultyRuntime).toContain("resolveUploadScanState");
    expect(facultyRuntime).toContain("scan_state: scanState");
    expect(facultyRuntime).toContain('if (scanState !== "clean")');
  });

  test("week linkage is wired through faculty create/update/list", () => {
    // Week/lecture linkage is now DERIVED from the official delivery plan session,
    // never accepted from the client.
    expect(facultyRuntime).toContain("deriveMaterialRow");
    expect(facultyRuntime).toContain("listPlanSessionsForMaterials");
    expect(facultyRuntime).not.toContain("week_number: data.week_number");
    expect(facultyRuntime).toContain('.order("week_number", { ascending: true, nullsFirst: false })');
  });

  test("usage report + access log server functions exist and are owner-gated", () => {
    expect(facultyRuntime).toContain("getCourseMaterialsUsageReport");
    expect(facultyRuntime).toContain("listCourseMaterialAccessLogs");
    expect(facultyRuntime).toContain("buildMaterialsUsageReport");
  });

  test("runtime does not call the unapplied atomic RPC (cutover ordering preserved)", () => {
    expect(facultyRuntime).not.toContain("faculty_mutate_course_material_atomic");
    expect(facultyRuntime).not.toContain("mutateCourseMaterialAtomically");
    expect(facultyRuntime).not.toContain("faculty_reserve_course_material_upload");
    expect(facultyRuntime).not.toContain("faculty_finalize_course_material_upload");
    expect(studentRuntime).not.toContain("record_course_material_download");
  });

  test("student audience invariants from #154 are preserved exactly", () => {
    expect(studentRuntime).toContain('.eq("enrollment_status", "enrolled")');
    expect(studentRuntime).toContain("fetchCanonicalCurrentTerm");
    expect(studentRuntime).toContain("exactCurrentMaterialSectionIds");
    expect(countOccurrences(studentRuntime, "eligibleSectionIdsForStudent(")).toBe(4);
    expect(countOccurrences(studentRuntime, "canAccessPublishedMaterial(")).toBe(2);
    expect(studentRuntime).not.toContain('.from("student_academic_status")');
    expect(studentRuntime).not.toContain("for (const s of o.sections ?? [])");
  });
});

describe("activation state", () => {
  // PORTAL-COURSE-MATERIALS-PRODUCTION-SAFE-MIGRATION-AND-DEMO-CLOSURE-01:
  // schema + private bucket + authz matrix passed, so both flags are ON.
  test("both materials flags are enabled after the safe production migration", () => {
    expect(portalFeatures).toContain("facultyCourseMaterials: true");
    expect(portalFeatures).toContain("studentCourseMaterials: true");
  });
});
