/**
 * DELIVERY-MONITORING-POSITION-HEADS-01
 *
 * «متابعة سير العملية التعليمية» in the faculty portal is for the DEAN
 * (college-wide) and for DEPARTMENT HEADS (their departments) only. Headship is
 * ONE canonical rule shared by the UI gate and the RPC: an active
 * department-head administrative position (department = the position's), plus
 * the legacy role + faculty-profile department so nobody loses access.
 *
 * SOURCE-LEVEL + pure functions. The SQL behaviour is proven by the disposable
 * PostgreSQL rehearsal (scripts/delivery-monitoring-position-heads-01-pg/run.sh),
 * which this file runs when DMPH01_PG_REHEARSAL=1.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_MONITORING_COLLEGE_ROLES,
  DELIVERY_MONITORING_LABEL,
  canSeeDeliveryMonitoring,
  isoDay,
  legacyHeadedDepartmentIds,
  positionHeadedDepartmentIds,
} from "../../src/lib/faculty-portal/delivery-monitoring-roles";

const ROOT = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const DRAFTS = "docs/migration-drafts/DELIVERY-MONITORING-POSITION-HEADS-01";
const GATE = read("src/lib/faculty-portal/processing-access.functions.ts");
const HEADS = read("src/lib/faculty-portal/delivery-monitoring-heads.server.ts");
const SHELL = read("src/components/portal/FacultyPortalShell.tsx");
const DRAFT = read(`${DRAFTS}.sql`);

const TODAY = "2026-10-06";
const CS = "dept-cs";
const IT = "dept-it";
const headPosition = { id: "p-cs", is_active: true, is_department_head_position: true, department_id: CS };
const assignment = { position_id: "p-cs", is_active: true, assigned_from: "2026-01-01", assigned_to: null };

describe("canonical headship rule (pure)", () => {
  test("head by position → the POSITION's department, whatever the faculty profile says", () => {
    expect(positionHeadedDepartmentIds([assignment], [headPosition], TODAY)).toEqual([CS]);
    // production shape: role faculty_member only, faculty profile in another department
    expect(legacyHeadedDepartmentIds(["faculty_member"], [IT])).toEqual([]);
  });

  test("assignment window is inclusive on both ends", () => {
    const on = (from: string, to: string | null) =>
      positionHeadedDepartmentIds([{ ...assignment, assigned_from: from, assigned_to: to }], [headPosition], TODAY);
    expect(on(TODAY, TODAY)).toEqual([CS]);
    expect(on("2026-10-07", null)).toEqual([]); // not started
    expect(on("2026-01-01", "2026-10-05")).toEqual([]); // ended
  });

  test("every non-qualifying shape grants nothing (fail closed)", () => {
    const none = (a: object, p: object) =>
      positionHeadedDepartmentIds([{ ...assignment, ...a }], [{ ...headPosition, ...p }], TODAY);
    expect(none({ is_active: false }, {})).toEqual([]);
    expect(none({ is_active: null }, {})).toEqual([]);
    expect(none({ assigned_from: null }, {})).toEqual([]);
    expect(none({}, { is_active: false })).toEqual([]);
    expect(none({}, { is_department_head_position: false })).toEqual([]);
    expect(none({}, { department_id: null })).toEqual([]);
    expect(none({ position_id: "other" }, {})).toEqual([]);
    expect(positionHeadedDepartmentIds([], [headPosition], TODAY)).toEqual([]);
  });

  test("legacy rule = role department_head AND a faculty-profile department", () => {
    expect(legacyHeadedDepartmentIds(["faculty_member", "department_head"], [IT])).toEqual([IT]);
    expect(legacyHeadedDepartmentIds(["department_head"], [null])).toEqual([]);
    expect(legacyHeadedDepartmentIds(["department_head"], [])).toEqual([]);
  });

  test("isoDay is the UTC calendar day (database current_date)", () => {
    expect(isoDay(new Date("2026-10-06T23:59:59Z"))).toBe("2026-10-06");
  });
});

describe("faculty-portal tab gate", () => {
  const can = (roles: string[], headedDepartmentIds: string[] = []) =>
    canSeeDeliveryMonitoring({ roles, headedDepartmentIds });

  test("department head (position or legacy) → true", () => {
    expect(can(["faculty_member"], [CS])).toBe(true);
    expect(can(["faculty_member", "department_head"], [IT])).toBe(true);
  });
  test("dean → true (college-wide) without any headship", () => {
    expect([...DELIVERY_MONITORING_COLLEGE_ROLES]).toEqual(["dean"]);
    expect(can(["dean"])).toBe(true);
  });
  test("plain faculty → false", () => {
    expect(can(["faculty_member"])).toBe(false);
    expect(can([])).toBe(false);
  });
  test("registrar / student affairs / admins do not get the FACULTY-PORTAL tab", () => {
    for (const role of ["registrar", "student_affairs", "admin", "system_admin", "hr_officer", "finance_officer"]) {
      expect(can([role])).toBe(false);
      expect(can(["faculty_member", role])).toBe(false);
    }
  });
  test("the legacy role alone (no headed department) → false", () => {
    expect(can(["department_head"])).toBe(false);
  });
});

describe("server gate wiring", () => {
  test("canMonitorDelivery is computed server-side from roles + headed departments", () => {
    expect(GATE).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
    expect(GATE).toMatch(/headedDepartmentIdsForUser\(context\.userId, roles\)/);
    expect(GATE).toMatch(/canSeeDeliveryMonitoring\(\{ roles, headedDepartmentIds \}\)/);
  });

  test("a failed headship lookup fails closed (no department scope → false for non-deans)", () => {
    expect(GATE).toMatch(
      /let headedDepartmentIds: string\[\] = \[\];\s*try \{[^}]*headedDepartmentIdsForUser[^}]*\} catch \{\s*headedDepartmentIds = \[\];\s*\}/,
    );
    expect(canSeeDeliveryMonitoring({ roles: ["faculty_member"], headedDepartmentIds: [] })).toBe(false);
  });

  test("headship lookup reads both tables with the admin client and throws on any error", () => {
    expect(HEADS).toMatch(/from\s+["']@\/integrations\/supabase\/client\.server["']/);
    expect(HEADS).toMatch(/supabaseAdmin\s*\.from\("position_assignments"\)[\s\S]*?\.eq\("user_id", userId\)\s*\.eq\("is_active", true\)/);
    expect(HEADS).toMatch(/\.from\("organizational_positions"\)[\s\S]*?\.eq\("is_active", true\)\s*\.eq\("is_department_head_position", true\)/);
    expect(HEADS).toMatch(/\.from\("faculty_profiles"\)\.select\("department_id"\)\.eq\("user_id", userId\)/);
    expect(HEADS.match(/throw new Error\(/g)?.length).toBe(3);
    expect(HEADS).toContain("positionHeadedDepartmentIds(");
    expect(HEADS).toContain("legacyHeadedDepartmentIds(");
  });

  test("shell shows the tab only from the server flag, with the owner's label", () => {
    expect(DELIVERY_MONITORING_LABEL).toBe("متابعة سير العملية التعليمية");
    expect(SHELL).toMatch(/const showMonitoringLink = !!processingAccess\?\.canMonitorDelivery;/);
    expect(SHELL).toMatch(
      /if \(showMonitoringLink\) \{\s*baseItems\.splice\(3, 0, \{ to: "\/faculty-portal\/lecture-monitoring", label: DELIVERY_MONITORING_LABEL \}\);/,
    );
    expect(SHELL).not.toMatch(/NAV_ITEMS: NavItem\[\] = \[[^\]]*lecture-monitoring/);
    expect(SHELL).not.toContain('"متابعة التنفيذ"');
    // long label cannot break the strip: it scrolls horizontally, items never shrink
    expect(SHELL).toMatch(/overflow-x-auto whitespace-nowrap/);
  });

  test("dashboard monitoring entry obeys the same server flag as the shell", () => {
    expect(read("src/routes/faculty-portal.index.tsx")).toMatch(
      /\{processingAccess\?\.canMonitorDelivery\s*&&\s*\(\s*<Link to="\/faculty-portal\/lecture-monitoring"/,
    );
  });

  test("page heading uses the owner's name; unauthorized visitors get a friendly Arabic state", () => {
    const route = read("src/routes/faculty-portal.lecture-monitoring.tsx");
    expect(route).toContain('title="متابعة سير العملية التعليمية"');
    const panel = read("src/components/lecture-execution/DeliveryMonitoringPanel.tsx");
    expect(panel).toMatch(/message\.includes\("CDP_NOT_AUTHORIZED"\)\s*\? "غير مصرح/);
    expect(panel).toMatch(/data\.scope === "department"\s*\? departmentScopeLabel\(data\.departments\)/);
  });
});

describe("migration draft package", () => {
  test("draft is draft-only, transaction-wrapped and lives outside supabase/migrations", () => {
    expect(DRAFT.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect(DRAFT).toMatch(/\nBEGIN;\n/);
    expect(DRAFT.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(DRAFT).not.toMatch(/\b(INSERT INTO|UPDATE |DELETE FROM|DROP |TRUNCATE)/);
  });

  test("helper implements the canonical rule and is not client-executable", () => {
    expect(DRAFT).toMatch(
      /FUNCTION public\.delivery_monitoring_headed_departments\(p_user uuid\)\s*RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''/,
    );
    for (const clause of [
      "op.is_department_head_position AND op.is_active",
      "pa.is_active AND pa.assigned_from <= current_date",
      "(pa.assigned_to IS NULL OR pa.assigned_to >= current_date)",
      "op.department_id IS NOT NULL",
      "public.is_department_head_of(p_user, d.id)",
    ]) {
      expect(DRAFT).toContain(clause);
    }
    expect(DRAFT).toMatch(/REVOKE ALL ON FUNCTION public\.delivery_monitoring_headed_departments\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(DRAFT).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.delivery_monitoring_headed_departments\(uuid\) TO (anon|authenticated|PUBLIC)/i);
  });

  test("patches are anchor-checked against the applied bodies and never redefine protected helpers", () => {
    const applied = read("supabase/migrations/20260812015421_66baf4da-4449-4298-98e3-198ba08feeb2.sql");
    const monitoring = applied.slice(applied.indexOf("FUNCTION public.cdp_delivery_monitoring("));
    const view = applied.slice(applied.indexOf("FUNCTION public.cdp_can_view_section("), applied.indexOf("-- B)"));
    const count = (hay: string, needle: string) => hay.split(needle).length - 1;
    expect(count(monitoring, "elsif public.has_role(v_uid,'department_head'::public.app_role) then")).toBe(1);
    expect(count(monitoring, "public.is_department_head_of(v_uid, c.department_id)")).toBe(2);
    expect(count(view, "public.cdp_can_manage_section(_user_id, _course_section_id)")).toBe(1);
    for (const marker of ["DMPH01:gate", "DMPH01:scope", "DMPH01:view"]) expect(DRAFT).toContain(`'${marker}'`);
    expect(DRAFT).toContain("DMPH01_PATCH_ANCHOR_HITS");
    expect(DRAFT).toContain("CONTINUE WHEN position(r.marker in v_def) > 0;");
    expect(DRAFT).toContain("DMPH01_COLLEGE_SCOPE_OR_DENIAL_DRIFTED");
    expect(DRAFT).toContain("DMPH01_HELPER_MUST_NOT_BE_CLIENT_EXECUTABLE");
    expect(DRAFT).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(is_department_head_of|cdp_can_manage_section|has_role)\b/);
  });

  test("pre-flight and verify are single read-only SELECTs with the agreed verdict columns", () => {
    for (const [file, column] of [["preflight", "ready_to_apply"], ["verify", "applied_correctly"]] as const) {
      const sql = read(`${DRAFTS}.${file}.sql`);
      const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
      expect(code.trimStart().startsWith("WITH ")).toBe(true);
      expect(code.split(";").filter((s) => s.trim()).length).toBe(1);
      // statement keywords only — privilege names inside string literals do not count
      const keywords = code.replace(/'[^']*'/g, "''");
      expect(keywords).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|DO)\b/);
      expect(code).toContain(`AS ${column}`);
    }
    expect(read(`${DRAFTS}.rollback-by-forward.sql`).split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
  });

  test("nothing from this package was added to the applied migration chain", () => {
    const hits = spawnSync("grep", ["-rl", "delivery_monitoring_headed_departments", "supabase/migrations"], { cwd: ROOT });
    expect(hits.stdout.toString().trim()).toBe("");
  });
});

describe("disposable PostgreSQL rehearsal (opt-in: DMPH01_PG_REHEARSAL=1)", () => {
  test.skipIf(process.env.DMPH01_PG_REHEARSAL !== "1")(
    "apply twice, authorization matrix, rollback",
    () => {
      const run = spawnSync("bash", ["scripts/delivery-monitoring-position-heads-01-pg/run.sh"], { cwd: ROOT });
      const out = run.stdout.toString() + run.stderr.toString();
      expect(out).toContain("DELIVERY_MONITORING_POSITION_HEADS_01_CASES_PASS");
      expect(out).toContain("DELIVERY_MONITORING_POSITION_HEADS_01_REHEARSAL_PASS");
      expect(run.status).toBe(0);
    },
    120_000,
  );
});
