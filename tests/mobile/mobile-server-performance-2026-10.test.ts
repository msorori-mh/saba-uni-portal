import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Body of an exported server function, up to the next top-level export. */
function exportedBlock(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} = createServerFn(`);
  expect(start).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("getMyProgress — one profile read, parallel independent reads", () => {
  const src = read("src/lib/academic-status.functions.ts");
  const compute = src.slice(
    src.indexOf("async function computeStudentProgress("),
    src.indexOf("/* ----------------------- exported server functions"),
  );
  const mine = exportedBlock(src, "getMyProgress");

  it("reads the profile once and hands it to computeStudentProgress", () => {
    expect(mine.match(/\.from\("student_profiles"\)/g)?.length).toBe(1);
    expect(mine).toContain('.select(PROGRESS_PROFILE_SELECT).eq("user_id", userId)');
    expect(mine).toContain("computeStudentProgress(supabase, profileId, sp)");
    // the only profile read left in the computation is skipped when preloaded
    expect(compute.match(/\.from\("student_profiles"\)/g)?.length).toBe(1);
    expect(compute).toMatch(/preloadedProfile\s*\?\s*Promise\.resolve\(preloadedProfile\)/);
  });

  it("stays self-scoped and fail-closed", () => {
    expect(mine).toContain("requireSupabaseAuth");
    // the caller's own RLS client, never the admin client
    expect(mine).toContain("const { userId, supabase } = context;");
    expect(mine).not.toContain("supabaseAdmin");
    expect(mine).toContain('if (!profileId) throw new Error("Student profile not found");');
    expect(mine.indexOf("if (!profileId) throw")).toBeLessThan(mine.indexOf("computeStudentProgress("));
    expect(compute).toContain('if (!sp) throw new Error("Student not found");');
  });

  it("still awaits the audit write before returning", () => {
    expect(mine).toContain('await audit("student_progress_viewed", dto.student.academic_number, dto.student.id, userId);');
    expect(mine.indexOf("await audit(")).toBeLessThan(mine.indexOf("return dto;"));
    const staff = exportedBlock(src, "getStudentProgress");
    expect(staff).toContain('await audit("student_progress_viewed"');
    // staff path: authorization is decided before any progress read
    expect(staff.indexOf('if (!allowed) throw new Error("Forbidden");')).toBeLessThan(
      staff.indexOf("computeStudentProgress("),
    );
  });

  it("sends independent reads together and keeps read errors fatal", () => {
    expect(compute).toContain("await Promise.all([");
    expect(compute).toContain("await Promise.allSettled([");
    for (const table of ["student_academic_status", "student_enrollments", "student_grades", "grade_components", "study_plans"]) {
      expect(compute).toContain(`.from("${table}")`);
    }
    expect(compute.match(/تعذّر تحميل السجل/g)?.length).toBe(3);
    expect(compute).toContain("settledValue(gradesResult)");
    expect(compute).toContain("settledValue(componentsResult)");
    expect(compute).toContain("settledValue(planResult)");
    expect(src).toContain('if (result.status === "rejected") throw result.reason;');
  });
});

describe("student materials — parallel context and reads", () => {
  const src = read("src/lib/student-materials.functions.ts");
  const context = src.slice(
    src.indexOf("async function loadStudentMaterialsContext("),
    src.indexOf("export const listStudentCourseMaterials"),
  );

  it("profile and linkage mode are read together, profile still mandatory", () => {
    expect(context).toContain("await Promise.all([");
    expect(context).toContain("getStudentProfile(context.supabase as any, context.userId)");
    expect(context).toContain("getLinkageMode(supabaseAdmin)");
    expect(src).toContain('if (!data) throw new Error("لا يوجد ملف طالب");');
  });

  it("both list functions use the shared context and authorize before reading materials", () => {
    const list = exportedBlock(src, "listStudentCourseMaterials");
    const course = exportedBlock(src, "listStudentMaterialsForCourse");
    for (const block of [list, course]) {
      expect(block).toContain("requireSupabaseAuth");
      expect(block).toContain("await loadStudentMaterialsContext(context)");
      expect(block).toContain("await eligibleSectionIdsForStudent(supabaseAdmin, student, mode)");
      expect(block).toContain("await Promise.all([");
      expect(block.indexOf("eligibleSectionIdsForStudent(")).toBeLessThan(block.indexOf('.from("course_materials")'));
    }
    expect(list.indexOf("if (sectionIds.size === 0) return")).toBeLessThan(list.indexOf("await Promise.all(["));
    expect(course.indexOf("if (!sectionIds.has(data.sectionId)) throw")).toBeLessThan(
      course.indexOf("await Promise.all(["),
    );
  });

  it("the download path keeps its serial owner/student authorization", () => {
    const download = exportedBlock(src, "getCourseMaterialDownloadUrl");
    expect(download).not.toContain("Promise.all");
    expect(download).toContain("const student = await getStudentProfile(");
    expect(download.indexOf("isMaterialFileDownloadable(")).toBeLessThan(download.indexOf("createSignedUrl("));
    expect(download).toContain('await supabaseAdmin.from("course_material_events").insert(');
  });

  it("no current term still yields an empty audience", () => {
    const eligible = src.slice(
      src.indexOf("async function eligibleSectionIdsForStudent("),
      src.indexOf("async function loadStudentMaterialsContext("),
    );
    expect(eligible).toContain("await Promise.all([");
    expect(eligible.indexOf("if (!currentTerm) return new Set<string>();")).toBeLessThan(
      eligible.indexOf("if (error) throw new Error(error.message);"),
    );
    expect(eligible).toContain('.eq("enrollment_status", "enrolled")');
  });
});

describe("mobile client cache and polling", () => {
  it("mobile queries are kept for 30 minutes without touching the global defaults", () => {
    expect(read("src/lib/mobile/query-cache.ts")).toContain("export const MOBILE_QUERY_GC_TIME_MS = 30 * 60_000;");
    const router = read("src/router.tsx");
    expect(router).toContain("gcTime: 5 * 60_000,");
    expect(router).not.toContain("MOBILE_QUERY_GC_TIME_MS");

    const files = readdirSync(join(root, "src/routes"))
      .filter((f) => /^mobile\.student.*\.tsx$/.test(f))
      .map((f) => `src/routes/${f}`)
      .concat("src/lib/mobile/student-context.ts");
    let queries = 0;
    for (const file of files) {
      const src = read(file);
      const count = src.match(/\buseQuery\(\{/g)?.length ?? 0;
      if (count === 0) continue;
      queries += count;
      expect({ file, gc: src.match(/gcTime: MOBILE_QUERY_GC_TIME_MS,/g)?.length ?? 0 }).toEqual({ file, gc: count });
      expect(src.match(/\bgcTime:/g)?.length).toBe(count);
    }
    expect(queries).toBeGreaterThanOrEqual(20);
  });

  it("staleTime semantics are unchanged on the main screens", () => {
    expect(read("src/routes/mobile.student.grades.tsx")).toContain("staleTime: 3 * 60 * 1000,");
    expect(read("src/routes/mobile.student.schedule.tsx")).toContain("staleTime: 5 * 60 * 1000,");
    expect(read("src/routes/mobile.student.finance.tsx")).toContain("staleTime: 90_000,");
    expect(read("src/routes/mobile.student.documents.index.tsx")).toContain("staleTime: 2 * 60_000,");
    expect(read("src/lib/mobile/student-context.ts")).toContain("staleTime: 5 * 60 * 1000,");
  });

  it("the unread badge polls every 2 minutes and still refreshes on focus", () => {
    const layout = read("src/routes/mobile.student.tsx");
    const badge = layout.slice(layout.indexOf('"unread-count", authUserId]'), layout.indexOf("const handleLogout"));
    expect(badge).toContain("refetchInterval: 120_000,");
    expect(badge).toContain("refetchOnWindowFocus: true,");
    expect(badge).toContain("staleTime: 30_000,");
    expect(layout).not.toContain("refetchInterval: 60_000");
  });

  it("sign-out and account switch still drop every cached query", () => {
    const layout = read("src/routes/mobile.student.tsx");
    expect(layout.match(/queryClient\.clear\(\);/g)?.length).toBe(2);
  });

  it("the document view selects only the rendered columns, owner-scoped", () => {
    const detail = read("src/routes/mobile.student.documents.$id.tsx");
    expect(detail).toContain(
      '.select("id, document_type, document_number, verification_code, issued_at, status, metadata")',
    );
    expect(detail).toContain('.eq("id", id).eq("student_profile_id", spId).maybeSingle()');
    expect(detail).not.toContain('.select("*")');
    expect(detail).not.toContain("pdf_url");
    const base = read("src/components/documents/DocumentTemplates.tsx");
    const type = base.slice(base.indexOf("export type DocumentBase = {"), base.indexOf("export type StudentInfo"));
    for (const field of ["id", "document_type", "document_number", "verification_code", "issued_at", "status", "metadata"]) {
      expect(type).toContain(`  ${field}:`);
    }
    expect(type.match(/^  \w+:/gm)?.length).toBe(7);
  });
});
