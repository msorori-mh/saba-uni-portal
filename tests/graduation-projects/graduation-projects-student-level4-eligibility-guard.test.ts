import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  GP_FOURTH_ACADEMIC_LEVEL_NUMBER,
  GP_STUDENT_LEVEL4_REQUIRED_MSG,
  isCurrentFourthAcademicLevel,
  isGpStudentLevel4EligibleFromStatus,
} from "@/lib/graduation-projects/eligibility";
import { classifyGpError, ERROR_LABELS } from "@/lib/graduation-projects/errors";

const root = process.cwd();
const draftPath = join(
  root,
  "docs",
  "migration-drafts",
  "GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql",
);
const verifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-student-level4-eligibility-guard-verifier.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-minimal-schema.sql",
);
const a1Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120000_gp_mvp_package_a1_foundation_01.sql",
);
const a2Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120100_gp_mvp_package_a2_storage_01.sql",
);
const a3Path = join(
  root,
  "supabase",
  "migrations",
  "20260806120200_gp_mvp_package_a3_lifecycle_01.sql",
);
const storageFixPath = join(
  root,
  "supabase",
  "migrations",
  "20260807003000_gp_mvp_storage_insert_policy_predicate_fix_01.sql",
);
const studentIndexPath = join(root, "src", "routes", "student.index.tsx");
const studentGpRoutePath = join(
  root,
  "src",
  "routes",
  "student.graduation-projects.tsx",
);
const facultyShellPath = join(
  root,
  "src",
  "components",
  "portal",
  "FacultyPortalShell.tsx",
);
const adminShellPath = join(
  root,
  "src",
  "components",
  "admin",
  "AdminShell.tsx",
);

const draft = readFileSync(draftPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const studentIndex = readFileSync(studentIndexPath, "utf8");
const studentGpRoute = readFileSync(studentGpRoutePath, "utf8");
const facultyShell = readFileSync(facultyShellPath, "utf8");
const adminShell = readFileSync(adminShellPath, "utf8");

const container = `gp-l4-eligibility-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { ok: res.status === 0, out };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      const probe = psql("select 1;");
      if (probe.ok) return true;
    }
    await Bun.sleep(500);
  }
  return false;
}

afterAll(() => {
  teardownContainer();
});

describe("GP student Level-4-only eligibility guard", () => {
  it("defines a single fail-closed canonical Level-4 predicate", () => {
    expect(draft).toContain("DRAFT ONLY");
    expect(draft).toContain("DO NOT APPLY");
    expect(draft).toContain("student_is_current_fourth_academic_level");
    expect(draft).toContain("require_student_gp_fourth_level_eligibility");
    expect(draft).toContain("student_academic_status");
    expect(draft).toContain("academic_levels");
    expect(draft).toContain("level_number");
    expect(draft).toContain("updated_at desc nulls last");
    expect(draft).toContain("fourth-level student eligibility required");
    expect(draft).toContain("GP_STUDENT_L4_GUARD_PREDICATE_EXISTS");
    expect(draft).not.toMatch(/exception when others/i);
  });

  it("wires the predicate into student-facing team/read/write helpers", () => {
    for (const fragment of [
      "create or replace function public.require_graduation_project_leader",
      "create or replace function public.gp_team_mutator",
      "create or replace function public.create_graduation_project_team",
      "create or replace function public.add_graduation_project_team_member",
      "create or replace function public.list_my_graduation_projects",
      "create or replace function public.get_graduation_project_detail",
      "create or replace function public.create_graduation_project_signed_download",
      "perform public.require_student_gp_fourth_level_eligibility(p_leader_student_profile_id)",
      "perform public.require_student_gp_fourth_level_eligibility(p_student_profile_id)",
      "perform public.require_caller_student_gp_fourth_level_when_student_only()",
      "perform public.require_student_actor_gp_fourth_level(p_project_id)",
    ]) {
      expect(draft).toContain(fragment);
    }
  });

  it("ships a transactional positive/negative verifier matrix", () => {
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
    for (const fragment of [
      "GP_STUDENT_LEVEL4_ONLY_ELIGIBILITY_GUARD_VERIFIER_PASS",
      "LEVEL4_POSITIVE",
      "LEVEL1_NEGATIVE",
      "LEVEL2_NEGATIVE",
      "LEVEL3_NEGATIVE",
      "UNKNOWN_LEVEL_NEGATIVE",
      "ZERO_SIDE_EFFECT_DENIAL",
      "STAFF_BEHAVIOR",
      "ARCHIVED_IMMUTABILITY",
      "STORAGE_PATH_ONLY_BYPASS",
      "fourth-level student eligibility required",
    ]) {
      expect(verifier).toContain(fragment);
    }
  });

  it("frontend nav/route guards are Level-4 presentation only and leave staff nav alone", () => {
    expect(studentIndex).toContain("isCurrentFourthAcademicLevel");
    expect(studentIndex).toContain('link.to !== "/student/graduation-projects"');
    expect(studentGpRoute).toContain("beforeLoad");
    expect(studentGpRoute).toContain("student_academic_status");
    expect(studentGpRoute).toContain("academic_levels(level_number)");
    expect(studentGpRoute).toContain("isCurrentFourthAcademicLevel");
    expect(studentGpRoute).not.toContain("searchParams");
    expect(studentGpRoute).not.toMatch(/level\s*=\s*4|levelNumber\s*=\s*4/);
    expect(facultyShell).toContain("/faculty-portal/graduation-projects");
    expect(adminShell).toContain("/admin/graduation-projects");
  });

  it("TS eligibility helper is fail-closed and maps authorization denial", () => {
    expect(GP_FOURTH_ACADEMIC_LEVEL_NUMBER).toBe(4);
    expect(isCurrentFourthAcademicLevel(4)).toBe(true);
    expect(isCurrentFourthAcademicLevel(1)).toBe(false);
    expect(isCurrentFourthAcademicLevel(2)).toBe(false);
    expect(isCurrentFourthAcademicLevel(3)).toBe(false);
    expect(isCurrentFourthAcademicLevel(undefined)).toBe(false);
    expect(isCurrentFourthAcademicLevel(null)).toBe(false);
    expect(isGpStudentLevel4EligibleFromStatus({ level: { level_number: 4 } })).toBe(true);
    expect(isGpStudentLevel4EligibleFromStatus({ level: { level_number: 3 } })).toBe(false);
    expect(isGpStudentLevel4EligibleFromStatus(null)).toBe(false);
    // Forged client-ish values must not pass the helper
    expect(isCurrentFourthAcademicLevel("4" as unknown as number)).toBe(false);
    expect(ERROR_LABELS["fourth-level student eligibility required"]).toContain("المستوى الرابع");
    expect(classifyGpError({ message: "fourth-level student eligibility required" })).toBe(
      "authorization",
    );
    expect(GP_STUDENT_LEVEL4_REQUIRED_MSG.length).toBeGreaterThan(10);
  });

  it("launches disposable PG17 and proves the L4 eligibility authorization chain", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );
    const ready = await waitReady();
    expect(ready).toBe(true);

    const applied: string[] = [];
    for (const [label, path] of [
      ["minimal-schema", minimalSchemaPath],
      ["A1", a1Path],
      ["A2", a2Path],
      ["A3", a3Path],
      ["storage-fix", storageFixPath],
      ["L4-draft", draftPath],
    ] as const) {
      const result = psqlFile(path);
      if (!result.ok) {
        throw new Error(`${label} failed:\n${result.out}`);
      }
      applied.push(label);
    }
    expect(applied).toEqual([
      "minimal-schema",
      "A1",
      "A2",
      "A3",
      "storage-fix",
      "L4-draft",
    ]);

    const noticeCheck = psqlFile(verifierPath);
    expect(noticeCheck.ok).toBe(true);
    expect(noticeCheck.out).toContain(
      "GP_STUDENT_LEVEL4_ONLY_ELIGIBILITY_GUARD_VERIFIER_PASS",
    );
  }, 180_000);
});
