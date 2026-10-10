/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01
 *
 * One admin-only switch pauses every NEW student-service request.
 *  - client contract (pure): parsing fails closed, message validation, error mapping
 *  - migration draft: single choke point on student_requests, admin-only write,
 *    audit, default ENABLED, no rewrite of any deployed function
 *  - server gate: every student start/submit server function is gated,
 *    including the service-role fallback writes
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR,
  STUDENT_SERVICES_DISABLED_ERROR_CODE,
  STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR,
  STUDENT_SERVICES_MESSAGE_MAX_LENGTH,
  STUDENT_SERVICES_STATUS_NOT_INSTALLED,
  STUDENT_SERVICES_SWITCH_ADMIN_ROLES,
  isResubmissionAllowedWhilePaused,
  isStudentServicesDisabledError,
  isStudentServicesSwitchNotInstalled,
  parseStudentServicesStatus,
  resolveStudentServicesNoticeAr,
  studentServicesDisabledMessageAr,
  validateStudentServicesMessage,
} from "@/lib/student-requests/student-services-switch";
import { mapStudentRequestRpcError } from "@/lib/student-request-rpc";
import { B1AdapterError, b1AdapterErrorMessageAr } from "@/lib/student-requests/b1-ui/adapter.types";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const DRAFT_PATH = "docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql";
const draft = read(DRAFT_PATH);
/** The draft without `--` comments, so prose can never satisfy an assertion. */
const draftSql = draft
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

function functionBody(name: string): string {
  const start = draftSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = draftSql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return draftSql.slice(start, end);
}

describe("client contract", () => {
  it("uses the owner-approved default notice", () => {
    expect(STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR).toBe(
      "الخدمات الطلابية متوقفة مؤقتًا. يمكنك متابعة طلباتك السابقة.",
    );
    expect(resolveStudentServicesNoticeAr(null)).toBe(STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR);
    expect(resolveStudentServicesNoticeAr("   ")).toBe(STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR);
    expect(resolveStudentServicesNoticeAr(" صيانة حتى الأحد ")).toBe("صيانة حتى الأحد");
  });

  it("parses the status payload and fails closed on anything unexpected", () => {
    expect(parseStudentServicesStatus({ enabled: true, message_ar: "x", updated_at: "t" })).toEqual({
      enabled: true,
      messageAr: null,
      updatedAt: "t",
      installed: true,
    });
    expect(parseStudentServicesStatus({ enabled: false, message_ar: "عطلة" }).messageAr).toBe("عطلة");
    expect(parseStudentServicesStatus({ enabled: false, message_ar: null }).messageAr).toBe(
      STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR,
    );
    for (const odd of [null, undefined, "true", 1, [], {}, { enabled: "true" }, { enabled: 1 }]) {
      expect(parseStudentServicesStatus(odd).enabled).toBe(false);
    }
  });

  it("treats only a missing RPC as 'not installed' (nothing paused before the migration)", () => {
    expect(STUDENT_SERVICES_STATUS_NOT_INSTALLED).toEqual({
      enabled: true,
      messageAr: null,
      updatedAt: null,
      installed: false,
    });
    expect(isStudentServicesSwitchNotInstalled({ code: "42883" })).toBe(true);
    expect(isStudentServicesSwitchNotInstalled({ code: "PGRST202" })).toBe(true);
    expect(
      isStudentServicesSwitchNotInstalled({
        message: "Could not find the function public.get_student_services_status",
      }),
    ).toBe(true);
    expect(isStudentServicesSwitchNotInstalled({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isStudentServicesSwitchNotInstalled({ message: "fetch failed" })).toBe(false);
    expect(isStudentServicesSwitchNotInstalled(null)).toBe(false);
  });

  it("validates the admin message: plain text, trimmed, bounded", () => {
    expect(STUDENT_SERVICES_MESSAGE_MAX_LENGTH).toBe(500);
    expect(validateStudentServicesMessage(null)).toEqual({ ok: true, value: null });
    expect(validateStudentServicesMessage("   ")).toEqual({ ok: true, value: null });
    expect(validateStudentServicesMessage("  صيانة\r\nحتى الأحد ")).toEqual({
      ok: true,
      value: "صيانة\nحتى الأحد",
    });
    expect(validateStudentServicesMessage("ا".repeat(500)).ok).toBe(true);
    expect(validateStudentServicesMessage("ا".repeat(501)).ok).toBe(false);
    expect(validateStudentServicesMessage("<b>توقف</b>").ok).toBe(false);
    expect(validateStudentServicesMessage("توقف\u0007").ok).toBe(false);
    expect(validateStudentServicesMessage(42).ok).toBe(false);
  });

  it("only a request staff returned may still be (re)submitted while paused", () => {
    expect(isResubmissionAllowedWhilePaused("returned")).toBe(true);
    expect(isResubmissionAllowedWhilePaused("returned_for_completion")).toBe(true);
    for (const status of ["draft", "submitted", "under_review", "approved", "cancelled", "", null, undefined]) {
      expect(isResubmissionAllowedWhilePaused(status)).toBe(false);
    }
  });

  it("flips only for admin | system_admin (same pair as assertAdmin)", () => {
    expect([...STUDENT_SERVICES_SWITCH_ADMIN_ROLES].sort()).toEqual(["admin", "system_admin"]);
    const authz = read("src/lib/authz.server.ts");
    expect(authz).toMatch(
      /export async function assertAdmin\(userId: string\): Promise<void> \{\s*await assertAnyRole\(userId, \["admin", "system_admin"\]/,
    );
  });
});

describe("error mapping for a submit that raced the switch", () => {
  it("recognises the server code in every error shape", () => {
    expect(STUDENT_SERVICES_DISABLED_ERROR_CODE).toBe("STUDENT_SERVICES_TEMPORARILY_DISABLED");
    expect(isStudentServicesDisabledError("STUDENT_SERVICES_TEMPORARILY_DISABLED")).toBe(true);
    expect(isStudentServicesDisabledError(new Error("x STUDENT_SERVICES_TEMPORARILY_DISABLED y"))).toBe(true);
    expect(isStudentServicesDisabledError({ message: "STUDENT_SERVICES_TEMPORARILY_DISABLED" })).toBe(true);
    expect(isStudentServicesDisabledError(new Error(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR))).toBe(true);
    expect(isStudentServicesDisabledError(new Error("B1_STALE_REQUEST_VERSION"))).toBe(false);
    expect(isStudentServicesDisabledError(null)).toBe(false);
    expect(studentServicesDisabledMessageAr(new Error("other"))).toBeNull();
  });

  it("legacy RPC wrapper shows the friendly Arabic message, never the raw code", () => {
    const text = mapStudentRequestRpcError({
      message: "STUDENT_SERVICES_TEMPORARILY_DISABLED",
      code: "P0001",
    });
    expect(text).toBe(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR);
    expect(text).not.toContain("STUDENT_SERVICES_TEMPORARILY_DISABLED");
    // unrelated errors keep their own text
    expect(mapStudentRequestRpcError({ message: "نوع الطلب غير متاح للطالب" })).toBe(
      "نوع الطلب غير متاح للطالب",
    );
  });

  it("the pause is never mistaken for 'RPC unavailable' (which would open the fallback path)", () => {
    const rpc = read("src/lib/student-request-rpc.ts");
    const unavailable = rpc.slice(
      rpc.indexOf("export function isStudentRequestCoreRpcUnavailable"),
      rpc.indexOf("export function isWorkflowRpcUnavailable"),
    );
    expect(unavailable).not.toContain("P0001");
    expect(/function .* does not exist/i.test("STUDENT_SERVICES_TEMPORARILY_DISABLED")).toBe(false);
    expect(/could not find the function/i.test("STUDENT_SERVICES_TEMPORARILY_DISABLED")).toBe(false);
    expect(/schema cache/i.test("STUDENT_SERVICES_TEMPORARILY_DISABLED")).toBe(false);
    expect(draftSql).toMatch(
      /RAISE EXCEPTION 'STUDENT_SERVICES_TEMPORARILY_DISABLED'\s+USING ERRCODE = 'P0001'/,
    );
  });

  it("B1 adapter shows the friendly message whatever code the error was classified under", () => {
    for (const code of ["UNEXPECTED_ERROR", "PERMISSION_DENIED", "VALIDATION_ERROR", "ACTIVATION_BLOCKED"] as const) {
      expect(
        b1AdapterErrorMessageAr(new B1AdapterError(code, "STUDENT_SERVICES_TEMPORARILY_DISABLED")),
      ).toBe(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR);
    }
    expect(b1AdapterErrorMessageAr(new Error("STUDENT_SERVICES_TEMPORARILY_DISABLED"))).toBe(
      STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR,
    );
    // existing mappings are untouched
    expect(b1AdapterErrorMessageAr(new B1AdapterError("PERMISSION_DENIED", "x"))).toBe(
      "لا تملك صلاحية تنفيذ هذا الإجراء على هذا الطلب.",
    );
  });

  it("the secure-draft RPC client lets the pause code through instead of 'قيد التحديث'", () => {
    const rpc = read("src/lib/student-requests/b1-secure-draft/rpc.ts");
    const known = rpc.slice(rpc.indexOf("B1_SECURE_DRAFT_KNOWN_CODES"), rpc.indexOf("function knownCodeIn"));
    expect(known).toContain('"STUDENT_SERVICES_TEMPORARILY_DISABLED"');
  });
});

describe("migration draft", () => {
  it("is a draft only, in the drafts folder, with pre-flight and verify companions", () => {
    expect(draft.split("\n")[0]).toBe("-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.");
    expect(existsSync(join(ROOT, "docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.preflight.sql"))).toBe(true);
    expect(existsSync(join(ROOT, "docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.verify.sql"))).toBe(true);
    const applied = readdirSync(join(ROOT, "supabase/migrations")).filter((name) =>
      /student[-_]services[-_](global[-_])?switch/i.test(name),
    );
    expect(applied).toEqual([]);
    for (const name of readdirSync(join(ROOT, "supabase/migrations"))) {
      if (!name.endsWith(".sql")) continue;
      expect(read(`supabase/migrations/${name}`)).not.toContain("student_services_switch");
    }
  });

  it("companion queries are read-only", () => {
    for (const suffix of ["preflight", "verify"]) {
      const sql = read(`docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.${suffix}.sql`)
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n");
      expect(sql).toContain("BEGIN TRANSACTION READ ONLY;");
      expect(sql.trim().endsWith("ROLLBACK;")).toBe(true);
      expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s|ALTER\s|DROP\s|TRUNCATE\s|GRANT\s|REVOKE\s|COMMIT)\b/i);
    }
  });

  it("is one transaction and aborts on a foreign environment before creating anything", () => {
    expect(draftSql).toMatch(/^BEGIN;$/m);
    expect(draftSql.trim().endsWith("COMMIT;")).toBe(true);
    const pre = draftSql.slice(draftSql.indexOf("DO $pre$"), draftSql.indexOf("$pre$;"));
    expect(draftSql.indexOf("DO $pre$")).toBeLessThan(draftSql.indexOf("CREATE TABLE"));
    for (const guard of [
      "STUDENT_SERVICES_SWITCH_01_ROLE_MISSING",
      "STUDENT_SERVICES_SWITCH_01_RELATION_MISSING",
      "STUDENT_SERVICES_SWITCH_01_COLUMN_CONTRACT_MISMATCH",
      "STUDENT_SERVICES_SWITCH_01_FUNCTION_MISSING",
      "STUDENT_SERVICES_SWITCH_01_LOG_AUDIT_OVERLOADS",
      "STUDENT_SERVICES_SWITCH_01_TABLE_CONTRACT_MISMATCH",
      "STUDENT_SERVICES_SWITCH_01_TRIGGER_NAME_TAKEN",
    ]) {
      expect(pre).toContain(guard);
    }
  });

  it("stores the flag in a dedicated single-row table that the API roles cannot touch", () => {
    expect(draftSql).toContain("CREATE TABLE IF NOT EXISTS public.student_services_switch (");
    expect(draftSql).toMatch(/id\s+boolean\s+PRIMARY KEY DEFAULT true/);
    expect(draftSql).toContain("CONSTRAINT student_services_switch_singleton_chk CHECK (id)");
    expect(draftSql).toContain("char_length(message_ar) BETWEEN 1 AND 500");
    expect(draftSql).toContain("ALTER TABLE public.student_services_switch ENABLE ROW LEVEL SECURITY;");
    expect(draftSql).not.toMatch(/CREATE POLICY/i);
    expect(draftSql).toContain(
      "REVOKE ALL ON public.student_services_switch FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(draftSql).toContain("GRANT SELECT ON public.student_services_switch TO service_role;");
    expect(draftSql).not.toMatch(/GRANT[^;]*ON public\.student_services_switch TO[^;]*(anon|authenticated)/i);
    // not the publicly readable site_settings table
    expect(draftSql).not.toContain("site_settings");
  });

  it("is seeded ENABLED in the same transaction and never reset by a re-apply", () => {
    expect(draftSql).toMatch(
      /INSERT INTO public\.student_services_switch \(id, enabled, message_ar, updated_by\)\s+VALUES \(true, true, NULL, NULL\)\s+ON CONFLICT \(id\) DO NOTHING;/,
    );
    expect(draftSql).toContain("BEFORE DELETE ON public.student_services_switch");
    expect(draftSql).toContain("BEFORE TRUNCATE ON public.student_services_switch");
  });

  it("predicate: missing row answers disabled (fail closed), safe search_path", () => {
    const fn = functionBody("student_services_enabled");
    expect(fn).toContain("STABLE");
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = public, pg_temp");
    expect(fn).toMatch(/COALESCE\(\s*\(SELECT s\.enabled FROM public\.student_services_switch s WHERE s\.id\),\s*false\)/);
  });

  it("every SECURITY DEFINER function pins its search_path", () => {
    const definers = draftSql.split("CREATE OR REPLACE FUNCTION").slice(1);
    expect(definers.length).toBe(6);
    for (const chunk of definers) {
      const header = chunk.slice(0, chunk.indexOf("AS $$"));
      expect(header).toContain("SET search_path = public, pg_temp");
    }
  });

  it("admin RPC: admin | system_admin only, validated, upserting, audited", () => {
    const fn = functionBody("admin_set_student_services_enabled");
    expect(fn).toContain("p_enabled boolean");
    expect(fn).toContain("p_message text");
    const authCheck = fn.indexOf("STUDENT_SERVICES_SWITCH_AUTH_REQUIRED");
    const roleCheck = fn.indexOf("STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED");
    const write = fn.indexOf("INSERT INTO public.student_services_switch");
    expect(authCheck).toBeGreaterThan(-1);
    expect(roleCheck).toBeGreaterThan(authCheck);
    expect(write).toBeGreaterThan(roleCheck);
    expect(fn).toContain("public.has_any_role(v_uid, ARRAY['admin','system_admin'])");
    // no other role is ever accepted
    expect(fn).not.toMatch(/'(dean|registrar|student_affairs|department_head)'/);
    expect(fn).toContain("STUDENT_SERVICES_SWITCH_MESSAGE_TOO_LONG");
    expect(fn).toContain("STUDENT_SERVICES_SWITCH_MESSAGE_PLAIN_TEXT_REQUIRED");
    expect(fn).toContain("ON CONFLICT (id) DO UPDATE");
    expect(fn).toContain("PERFORM public.log_audit(");
    expect(fn.indexOf("PERFORM public.log_audit(")).toBeGreaterThan(write);
    for (const action of [
      "student_services_enabled",
      "student_services_disabled",
      "student_services_message_updated",
    ]) {
      expect(fn).toContain(`'${action}'`);
    }
    expect(draftSql).toContain(
      "REVOKE ALL ON FUNCTION public.admin_set_student_services_enabled(boolean, text) FROM PUBLIC, anon;",
    );
    expect(draftSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_set_student_services_enabled(boolean, text) TO authenticated;",
    );
  });

  it("student read never exposes who changed the switch, and hides the notice while enabled", () => {
    const fn = functionBody("get_student_services_status");
    expect(fn).not.toContain("updated_by");
    expect(fn).toContain("CASE WHEN v_row.enabled THEN NULL ELSE v_row.message_ar END");
    expect(draftSql).toContain("REVOKE ALL ON FUNCTION public.get_student_services_status() FROM PUBLIC, anon;");
    const admin = functionBody("admin_get_student_services_switch");
    expect(admin).toContain("STUDENT_SERVICES_SWITCH_ADMIN_REQUIRED");
    expect(admin).toContain("'updated_by', v_row.updated_by");
  });

  it("enforces at ONE choke point: a guard trigger on student_requests", () => {
    expect(draftSql).toMatch(
      /CREATE TRIGGER trg_00_student_services_switch_guard\s+BEFORE INSERT OR UPDATE ON public\.student_requests\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_student_services_switch\(\);/,
    );
    const fn = functionBody("guard_student_services_switch");
    // submit = a draft leaving draft; cancelling and resubmitting a returned request are out of scope
    expect(fn).toContain("OLD.status IS DISTINCT FROM 'draft'");
    expect(fn).toContain("NEW.status = 'cancelled'");
    expect(fn).not.toContain("'returned'");
    // enabled -> untouched; system/staff writes -> untouched; owner -> refused
    expect(fn).toContain("IF public.student_services_enabled() THEN\n    RETURN NEW;");
    expect(fn).toContain("IF v_uid IS NULL THEN\n    RETURN NEW;");
    expect(fn).toContain("WHERE sp.id = NEW.student_profile_id");
    expect(fn).toContain("IF v_owner IS NULL OR v_owner <> v_uid THEN\n    RETURN NEW;");
    expect(fn).toContain("RAISE EXCEPTION 'STUDENT_SERVICES_TEMPORARILY_DISABLED'");
    // no role can bypass the pause for its own request
    expect(fn).not.toContain("has_any_role");
    expect(fn).not.toContain("has_role");
  });

  it("rewrites no deployed function and no data (clean before or after PR #436)", () => {
    const created = [...draftSql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "admin_get_student_services_switch",
      "admin_set_student_services_enabled",
      "get_student_services_status",
      "guard_student_services_switch",
      "guard_student_services_switch_row",
      "student_services_enabled",
    ]);
    for (const untouched of [
      "initialize_b1_request_workflow_strict",
      "act_on_b1_student_request_step_atomic",
      "submit_b1_student_request_atomic",
      "submit_student_request",
      "create_student_request",
      "pg_get_functiondef",
      "request_types",
      "student_visible",
      "enrollment_certificate",
    ]) {
      expect(draftSql).not.toContain(untouched);
    }
    expect(draftSql).not.toMatch(/\b(UPDATE|DELETE FROM|INSERT INTO)\s+public\.student_requests\b/);
    expect(draftSql).not.toMatch(/\bDROP\s/i);
  });
});

describe("server gate (createServerFn handlers)", () => {
  const affairs = read("src/lib/student-affairs.functions.ts");
  const gate = read("src/lib/student-requests/student-services-switch.server.ts");

  it("fails closed when the state cannot be read, open only when the RPC is not installed", () => {
    expect(gate).toContain('client.rpc("get_student_services_status")');
    expect(gate).toMatch(
      /if \(isStudentServicesSwitchNotInstalled\(error\)\) return STUDENT_SERVICES_STATUS_NOT_INSTALLED;\s*throw new Error/,
    );
    expect(gate).toMatch(
      /try \{\s*status = await readStudentServicesStatus\(client\);\s*\} catch \{\s*throw new Error\(STUDENT_SERVICES_STATUS_UNAVAILABLE_MESSAGE_AR\);/,
    );
    expect(gate).toContain("if (!status.enabled) throw new Error(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR);");
    expect(gate).toContain("if (isResubmissionAllowedWhilePaused(options?.existingStatus)) return;");
    // the gate reads with the caller's session, never the service role
    expect(gate).not.toContain("supabaseAdmin");
  });

  it("gates every start/submit path before any write, including the service-role fallbacks", () => {
    const core = affairs.slice(
      affairs.indexOf("export async function submitCanonicalStudentRequestCore"),
      affairs.indexOf("const canonicalSubmitSchema"),
    );
    // P1 atomic branch
    expect(core.indexOf("assertStudentServicesOpenForNewRequest(input.sessionClient);")).toBeLessThan(
      core.indexOf("rpcSubmitStudentRequestWithDetails(input.sessionClient"),
    );
    // existing request: gated with its status, before the draft is rewritten
    const existingGate = core.indexOf("existingStatus: priorStatus");
    expect(existingGate).toBeGreaterThan(-1);
    expect(existingGate).toBeLessThan(core.indexOf("const updateValues"));
    // new request: gated before either create path (RPC or service-role fallback)
    const newBranch = core.slice(core.indexOf("// Global admin switch: covers the service-role fallback"));
    expect(newBranch.indexOf("assertStudentServicesOpenForNewRequest(input.sessionClient);")).toBeLessThan(
      newBranch.indexOf("createB1DraftFailClosed"),
    );
    expect(newBranch.indexOf("assertStudentServicesOpenForNewRequest(input.sessionClient);")).toBeLessThan(
      newBranch.indexOf("createDraftViaRpcOrFallback"),
    );
    expect(core.match(/assertStudentServicesOpenForNewRequest\(/g)?.length).toBe(3);

    const create = affairs.slice(
      affairs.indexOf("export const createStudentServiceRequest"),
      affairs.indexOf("export const saveStudentServiceRequestDraft"),
    );
    expect(create.indexOf("assertStudentServicesOpenForNewRequest(context.supabase);")).toBeGreaterThan(-1);
    expect(create.indexOf("assertStudentServicesOpenForNewRequest(context.supabase);")).toBeLessThan(
      create.indexOf("createB1DraftFailClosed"),
    );

    // submitStudentServiceRequest goes through the gated core
    const submit = affairs.slice(
      affairs.indexOf("export const submitStudentServiceRequest"),
      affairs.indexOf("export const getMyStudentServiceRequests"),
    );
    expect(submit).toContain("return submitCanonicalStudentRequestCore({");
  });

  it("the two service-role fallback writers are reachable only through gated callers", () => {
    for (const fallback of ["fallbackCreateStudentRequestDraft", "fallbackSubmitStudentRequest"]) {
      const calls = [...affairs.matchAll(new RegExp(`\\b${fallback}\\(`, "g"))];
      // one definition + exactly one call site (inside *ViaRpcOrFallback)
      expect(calls.length).toBe(2);
    }
    for (const helper of ["createDraftViaRpcOrFallback", "submitViaRpcOrFallback"]) {
      const callers = [...affairs.matchAll(new RegExp(`await ${helper}\\(`, "g"))].map((m) => m.index ?? 0);
      expect(callers.length).toBeGreaterThan(0);
      for (const index of callers) {
        const inCore =
          index > affairs.indexOf("export async function submitCanonicalStudentRequestCore") &&
          index < affairs.indexOf("const canonicalSubmitSchema");
        const inCreate =
          index > affairs.indexOf("export const createStudentServiceRequest") &&
          index < affairs.indexOf("export const saveStudentServiceRequestDraft");
        expect(inCore || inCreate).toBe(true);
      }
    }
  });

  it("no student start/submit code path writes student_requests outside the audited set", () => {
    // Every runtime writer of a NEW request row must be a known, gated one.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !path.endsWith("integrations/supabase/types.ts")) {
          if (/from\(["']student_requests["']\)\s*\.insert\(/.test(read(path).replace(/\s+/g, " ").replace(/\) \./g, ")."))) {
            writers.push(path);
          }
        }
      }
    };
    walk("src");
    expect(writers.sort()).toEqual([
      // legacy component, not mounted by any route; its direct inserts run with
      // the student's own session and are refused by the database trigger
      "src/components/portal/StudentRequestsSection.tsx",
      // service-role fallback, gated above
      "src/lib/student-affairs.functions.ts",
    ]);
  });
});

describe("admin server functions", () => {
  const fns = read("src/lib/student-requests/student-services-switch.functions.ts");

  it("setting the switch requires assertAdmin before anything else and uses the caller session", () => {
    const set = fns.slice(fns.indexOf("export const setAdminStudentServicesSwitch"));
    expect(set).toContain(".middleware([requireSupabaseAuth])");
    const handler = set.slice(set.indexOf(".handler("));
    expect(handler.indexOf("await assertAdmin(context.userId);")).toBeGreaterThan(-1);
    expect(handler.indexOf("await assertAdmin(context.userId);")).toBeLessThan(handler.indexOf(".rpc("));
    expect(handler).toContain('"admin_set_student_services_enabled"');
    expect(handler).toContain("asRpc(context.supabase).rpc(");
    // the switch is never written with the service role (which would lose the actor and the DB role check)
    expect(fns).not.toMatch(/supabaseAdmin\s*\.rpc\(/);
    expect(fns).not.toMatch(/from\(["']student_services_switch["']\)/);
    expect(set).toContain("validateStudentServicesMessage(");
    expect(fns.slice(fns.indexOf("const setSchema"), fns.indexOf("export const setAdminStudentServicesSwitch"))).toContain(".strict()");
  });

  it("non-admin staff get a read-only view without the actor", () => {
    const get = fns.slice(
      fns.indexOf("export const getAdminStudentServicesSwitch"),
      fns.indexOf("const setSchema"),
    );
    expect(get).toContain("await assertAnyRole(");
    expect(get).toContain("hasAnyRole(context.userId, STUDENT_SERVICES_SWITCH_ADMIN_ROLES)");
    const nonAdmin = get.slice(get.indexOf("if (!canManage) {"), get.indexOf('rpc.rpc("admin_get_student_services_switch")'));
    expect(nonAdmin).toContain("updatedByName: null");
    expect(nonAdmin).toContain("canManage: false");
    expect(nonAdmin).not.toContain("admin_get_student_services_switch");
    // unknown payload is "paused", never silently "enabled"
    expect(get).toContain("enabled: row.enabled === true,");
  });

  it("the student status read needs a session and never blocks browsing", () => {
    const status = fns.slice(
      fns.indexOf("export const getStudentServicesStatus"),
      fns.indexOf("async function resolveActorName"),
    );
    expect(status).toContain(".middleware([requireSupabaseAuth])");
    expect(status).toContain("readStudentServicesStatus(asRpc(context.supabase))");
  });
});

describe("rehearsal harness", () => {
  it("ships an isolated two-phase rehearsal (main, and after PR #436)", () => {
    const run = read("scripts/student-services-global-switch-01-pg17/run.sh");
    expect(run).toContain("listen_addresses=''");
    expect(run).not.toMatch(/supabase\.co|postgres(ql)?:\/\//i);
    expect(run).toContain("phase A: draft on main");
    expect(run).toContain("phase B: draft AFTER EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01");
    expect(run).toContain("IDEMPOTENCY_FINGERPRINT_MISMATCH");
    expect(run).toContain("PHASE_B_SKIPPED");
    const cases = read("scripts/student-services-global-switch-01-pg17/01-cases.sql");
    for (const path of [
      "create_student_request",
      "submit_student_request(",
      "submit_student_request_with_details",
      "submit_b1_student_request_atomic_core",
      "act_on_b1_student_request_step_atomic",
      "admin_set_student_services_enabled",
    ]) {
      expect(cases).toContain(path);
    }
  });
});
