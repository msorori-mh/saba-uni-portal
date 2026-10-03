import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("staff-portal review 2026-10 — layout guard", () => {
  const guard = read("src/routes/staff.tsx");
  const dashboard = read("src/routes/staff.index.tsx");

  it("blocks deactivated staff profiles", () => {
    expect(guard).toContain('select("must_change_password, status")');
    expect(guard).toContain("DISABLED_STAFF_STATUSES");
  });

  it("a transient profile read error shows a retry instead of signing out", () => {
    const errIdx = guard.indexOf("if (profileError)");
    const retryIdx = guard.indexOf("setGuardError(true)");
    const signOutIdx = guard.indexOf("supabase.auth.signOut()");
    expect(errIdx).toBeGreaterThan(0);
    expect(retryIdx).toBeGreaterThan(errIdx);
    expect(signOutIdx).toBeGreaterThan(retryIdx);
  });

  it("dashboard never spins forever on error or missing profile", () => {
    expect(dashboard).toContain("isError || (!isLoading && !profile)");
  });
});

describe("staff-portal review 2026-10 — employee views show own rows only", () => {
  const read2 = read("src/lib/staff-self-service-read.ts");
  const live = read("src/lib/staff-self-service-live.ts");
  const dash = read("src/components/staff-showcase/StaffSelfServiceLiveDashboard.tsx");
  const home = read("src/components/staff-portal/StaffEmployeeHome.tsx");
  const actions = read("src/components/staff-showcase/StaffSelfServiceLiveActions.tsx");

  it("read helpers support an own-only scope that never widens to all rows", () => {
    expect(read2).toContain("export type StaffReadScope");
    expect(read2).toContain('q.eq("staff_profile_id", ownId)');
    expect(read2).toContain("NO_OWN_PROFILE");
    expect(live).toContain('query.eq("staff_profile_id", ownId ?? "00000000-0000-0000-0000-000000000000")');
  });

  it("the employee dashboard and home request own-only data", () => {
    for (const call of [
      "fetchStaffLeaveBalances({ ownOnly: true })",
      "fetchStaffPayrollStatements({ ownOnly: true })",
      "fetchStaffCareerHistory({ ownOnly: true })",
      "fetchStaffCustody({ ownOnly: true })",
    ]) {
      expect(dash).toContain(call);
    }
    expect(home).toContain("listAccessibleStaffServiceRequests({ ownOnly: true })");
    expect(actions).toContain('ownOnly: variant === "employee"');
  });

  it("custody attention count reads the real column", () => {
    expect(home).not.toContain("condition_state");
  });
});

describe("staff-portal review 2026-10 — payroll PDF", () => {
  it("authorizes once (server-side) and maps errors", () => {
    const dash = read("src/components/staff-showcase/StaffSelfServiceLiveDashboard.tsx");
    const fn = read("src/lib/staff/staff-payroll-pdf.functions.ts");
    expect(dash).not.toContain("await authorizePayrollStatementDownload(");
    expect(fn).toContain("contractSchema.safeParse(raw)");
    expect(fn).not.toContain('throw new Error("STAFF_SERVICE_PAYROLL_ACCESS_DENIED")');
  });
});

describe("staff-portal review 2026-10 — B1 attachment download", () => {
  it("authorizes as the caller, then signs with the service role", () => {
    const src = read("src/lib/student-requests/b1-ui/b1-ui.functions.ts");
    const block = src.slice(
      src.indexOf("export async function createAuthorizedB1AttachmentDownload"),
      src.indexOf("export const authorizeB1UiAttachmentDownloadFn"),
    );
    expect(block.indexOf("rpcAuthorizeStudentRequestAttachmentDownload")).toBeLessThan(
      block.indexOf("await signer"),
    );
    const fnBlock = src.slice(src.indexOf("export const authorizeB1UiAttachmentDownloadFn"));
    expect(fnBlock.slice(0, 900)).toContain("supabaseAdmin.storage");
  });
});

describe("staff-portal review 2026-10 — deactivation", () => {
  it("bans the login before marking the profile inactive", () => {
    const src = read("src/lib/admin-staff-deletion.functions.ts");
    const block = src.slice(src.indexOf("export const deactivateStaffProfile"));
    const banIdx = block.indexOf('ban_duration: "876000h"');
    const statusIdx = block.indexOf('update({ status: "inactive" }');
    expect(banIdx).toBeGreaterThan(0);
    expect(statusIdx).toBeGreaterThan(banIdx);
  });
});

describe("staff-portal review 2026-10 — migration draft", () => {
  const sql = read("docs/migration-drafts/STAFF-PORTAL-REVIEW-REMEDIATION-01.sql");

  it("is a transaction-wrapped draft", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("B1 return/reject are gated by the step flags, other actions stay literal", () => {
    expect(sql).toContain("IF p_action = 'return' THEN");
    expect(sql).toContain("COALESCE(v_config.can_return_to_student, false)");
    expect(sql).toContain("COALESCE(v_config.can_reject, false)");
    expect(sql).toContain("ELSIF p_action IS DISTINCT FROM v_config.action_type THEN");
    // authorization still precedes the action check
    expect(sql.indexOf("can_current_user_act_on_step(p_step_id")).toBeLessThan(
      sql.indexOf("IF p_action = 'return' THEN"),
    );
  });

  it("no self-approval for anyone and approvals need a real role assignment", () => {
    expect(sql).not.toContain("and not public.staff_service_is_admin(auth.uid())");
    expect(sql).toContain("if auth.uid() = v_owner_user_id then");
    expect(sql).toContain("from public.staff_service_role_assignments a");
  });

  it("graduates-affairs staff list uses an existing column", () => {
    expect(sql).toContain("sp.full_name_ar");
    expect(sql).not.toContain("btrim(sp.full_name)");
  });

  it("processing bindings ignore deactivated profiles", () => {
    expect(sql).toContain("COALESCE(lower(sp.status), 'active') NOT IN ('inactive','suspended','disabled')");
    expect(sql).toContain("COALESCE(lower(fp.status), 'active') NOT IN ('inactive','suspended','disabled')");
  });
});
