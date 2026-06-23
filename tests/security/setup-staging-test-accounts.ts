#!/usr/bin/env bun
/**
 * SECURITY-FULL-ASSURANCE-03 — Staging test account & fixture setup.
 * Writes only to staging with SEC_SETUP_ALLOW_STAGING_WRITE=true.
 * Never logs passwords or service role keys.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";

const PRODUCTION_DOMAIN = "quboolye.com";
const TEST_MARKER = "SECURITY_TEST_ONLY";
const ACAD_A = "SEC-TEST-A";
const ACAD_B = "SEC-TEST-B";

type Outcome = "PASS" | "FAIL" | "SKIP" | "MANUAL";

interface StepResult {
  status: Outcome;
  name: string;
  reason: string;
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function loadSetupEnv(): void {
  const filePath = env("SEC_SETUP_ENV_FILE") ?? "tests/security/.env.setup.local";
  try {
    const raw = readFileSync(resolve(filePath), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    throw new Error(
      `Setup env file not found. Copy tests/security/staging-setup.example.env to tests/security/.env.setup.local and fill staging values.`,
    );
  }
}

function assertSetupAllowed(): {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  targetUrl: string;
  password: string;
} {
  if (env("SEC_SETUP_ALLOW_STAGING_WRITE") !== "true") {
    throw new Error(
      "Refusing staging writes: set SEC_SETUP_ALLOW_STAGING_WRITE=true in your local setup env file.",
    );
  }

  const supabaseUrl = env("SEC_SETUP_SUPABASE_URL");
  const serviceRoleKey = env("SEC_SETUP_SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = env("SEC_SETUP_SUPABASE_ANON_KEY");
  const targetUrl = env("SEC_SETUP_TARGET_URL");
  const password = env("SEC_TEST_PASSWORD");

  if (!supabaseUrl) throw new Error("SEC_SETUP_SUPABASE_URL is required");
  if (!serviceRoleKey) throw new Error("SEC_SETUP_SUPABASE_SERVICE_ROLE_KEY is required");
  if (!anonKey) throw new Error("SEC_SETUP_SUPABASE_ANON_KEY is required");
  if (!targetUrl) throw new Error("SEC_SETUP_TARGET_URL is required");
  if (!password || password.length < 12) {
    throw new Error("SEC_TEST_PASSWORD is required (min 12 chars, staging test accounts only)");
  }

  for (const [label, url] of [
    ["SEC_SETUP_SUPABASE_URL", supabaseUrl],
    ["SEC_SETUP_TARGET_URL", targetUrl],
  ] as const) {
    if (url.toLowerCase().includes(PRODUCTION_DOMAIN)) {
      throw new Error(`Refusing setup: ${label} contains production domain (${PRODUCTION_DOMAIN})`);
    }
  }

  const blocked = (env("SEC_SETUP_BLOCKED_PROJECT_REFS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const ref of blocked) {
    if (supabaseUrl.includes(ref)) {
      throw new Error(`Refusing setup: Supabase URL matches blocked project ref "${ref}"`);
    }
  }

  if (/prod(uction)?[.-]/i.test(supabaseUrl) && !env("SEC_SETUP_ACK_PRODUCTION_LIKE_URL")) {
    throw new Error(
      "Supabase URL looks production-like. Use staging URL or set SEC_SETUP_ACK_PRODUCTION_LIKE_URL=1 to override.",
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    targetUrl: targetUrl.replace(/\/$/, ""),
    password,
  };
}

function logStep(r: StepResult): void {
  console.log(`${r.status} ${r.name}${r.reason ? ` — ${r.reason}` : ""}`);
}

async function findAuthUserId(
  sb: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  const { data, error } = await sb.rpc("find_auth_user_id_by_email", { p_email: email });
  if (error) throw new Error(error.message);
  return data ? String(data) : null;
}

async function ensureAuthUser(
  sb: SupabaseClient<Database>,
  email: string,
  password: string,
  metadata: Record<string, string>,
): Promise<string> {
  const existing = await findAuthUserId(sb, email);
  if (existing) {
    const { error } = await sb.auth.admin.updateUserById(existing, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(error.message);
    return existing;
  }
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  return data.user.id;
}

async function ensureUserRole(
  sb: SupabaseClient<Database>,
  userId: string,
  role: Database["public"]["Enums"]["app_role"],
): Promise<void> {
  const { data } = await sb
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (!data) {
    const { error } = await sb.from("user_roles").insert({ user_id: userId, role });
    if (error) throw new Error(error.message);
  }
}

async function ensureCatalogRole(
  sb: SupabaseClient<Database>,
  userId: string,
  roleCode: string,
  assignedBy: string,
): Promise<void> {
  const { data } = await sb
    .from("user_role_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("role_code", roleCode)
    .maybeSingle();
  if (!data) {
    const { error } = await sb.from("user_role_assignments").insert({
      user_id: userId,
      role_code: roleCode,
      assigned_by: assignedBy,
      notes: TEST_MARKER,
    });
    if (error) throw new Error(error.message);
  }
}

async function ensureStaffProfile(
  sb: SupabaseClient<Database>,
  userId: string,
  input: {
    employee_number: string;
    full_name_ar: string;
    job_title: string;
    role_type: string;
  },
): Promise<string> {
  const { data: linked } = await sb
    .from("staff_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linked?.id) return linked.id;

  const { data: byEmp } = await sb
    .from("staff_profiles")
    .select("id, user_id")
    .eq("employee_number", input.employee_number)
    .maybeSingle();

  if (byEmp?.id) {
    if (byEmp.user_id && byEmp.user_id !== userId) {
      throw new Error(`employee_number ${input.employee_number} linked to another user`);
    }
    const { error } = await sb
      .from("staff_profiles")
      .update({ user_id: userId, full_name_ar: input.full_name_ar, job_title: input.job_title })
      .eq("id", byEmp.id);
    if (error) throw new Error(error.message);
    return byEmp.id;
  }

  const { data: inserted, error } = await sb
    .from("staff_profiles")
    .insert({
      employee_number: input.employee_number,
      full_name_ar: input.full_name_ar,
      full_name_en: "sec-test staff",
      job_title: input.job_title,
      role_type: input.role_type,
      status: "active",
      must_change_password: false,
      department_scope: "all",
      user_id: userId,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "staff profile insert failed");
  return inserted.id;
}

async function ensureFacultyProfile(
  sb: SupabaseClient<Database>,
  userId: string,
  employeeNumber: string,
): Promise<string> {
  const { data: linked } = await sb
    .from("faculty_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linked?.id) return linked.id;

  const { data: byEmp } = await sb
    .from("faculty_profiles")
    .select("id, faculty_id, user_id")
    .eq("employee_number", employeeNumber)
    .maybeSingle();

  if (byEmp?.id) {
    if (byEmp.user_id && byEmp.user_id !== userId) {
      throw new Error(`faculty employee_number ${employeeNumber} linked elsewhere`);
    }
    const { error: linkErr } = await sb.rpc("link_faculty_profile_account", {
      p_profile_id: byEmp.id,
      p_auth_user_id: userId,
    });
    if (linkErr) throw new Error(linkErr.message);
    return byEmp.id;
  }

  const { data: fac, error: facErr } = await sb
    .from("faculty")
    .insert({
      employee_id: employeeNumber,
      full_name_ar: `${TEST_MARKER} faculty`,
      category: "faculty",
      is_active: true,
    })
    .select("id")
    .single();
  if (facErr || !fac) throw new Error(facErr?.message ?? "faculty insert failed");

  const { data: profile, error: pErr } = await sb
    .from("faculty_profiles")
    .insert({
      faculty_id: fac.id,
      employee_number: employeeNumber,
      full_name_ar: `${TEST_MARKER} faculty`,
      status: "active",
      must_change_password: false,
    })
    .select("id")
    .single();
  if (pErr || !profile) throw new Error(pErr?.message ?? "faculty profile insert failed");

  const { error: linkErr } = await sb.rpc("link_faculty_profile_account", {
    p_profile_id: profile.id,
    p_auth_user_id: userId,
  });
  if (linkErr) throw new Error(linkErr.message);
  return profile.id;
}

async function ensureStudentProfile(
  sb: SupabaseClient<Database>,
  userId: string,
  academicNumber: string,
  label: "A" | "B",
): Promise<string> {
  const { data: byUser } = await sb
    .from("student_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser?.id) return byUser.id;

  const { data: byAcad } = await sb
    .from("student_profiles")
    .select("id, user_id")
    .eq("academic_number", academicNumber)
    .maybeSingle();

  if (byAcad?.id) {
    if (byAcad.user_id && byAcad.user_id !== userId) {
      throw new Error(`academic_number ${academicNumber} linked to another user`);
    }
    const { error } = await sb
      .from("student_profiles")
      .update({ user_id: userId })
      .eq("id", byAcad.id);
    if (error) throw new Error(error.message);
    return byAcad.id;
  }

  const { data: inserted, error } = await sb
    .from("student_profiles")
    .insert({
      user_id: userId,
      academic_number: academicNumber,
      full_name_ar: `${TEST_MARKER} طالب ${label}`,
      full_name_en: `sec-test student ${label}`,
      email: env(label === "A" ? "SEC_TEST_STUDENT_A_EMAIL" : "SEC_TEST_STUDENT_B_EMAIL"),
      status: "active",
      must_change_password: false,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "student profile insert failed");
  return inserted.id;
}

async function ensureOfficialDocument(
  sb: SupabaseClient<Database>,
  studentProfileId: string,
  suffix: "A" | "B",
): Promise<{ id: string; verificationCode: string }> {
  const docNumber = `SEC-DOC-${suffix}-001`;
  const verifyCode = `SECVER${suffix}0001`;

  const { data: existing } = await sb
    .from("official_documents")
    .select("id, verification_code, student_profile_id")
    .eq("document_number", docNumber)
    .maybeSingle();

  if (existing?.id) {
    if (existing.student_profile_id !== studentProfileId) {
      throw new Error(`document ${docNumber} belongs to another student`);
    }
    return { id: existing.id, verificationCode: existing.verification_code };
  }

  const { data: inserted, error } = await sb
    .from("official_documents")
    .insert({
      student_profile_id: studentProfileId,
      document_type: "enrollment_certificate",
      document_number: docNumber,
      verification_code: verifyCode,
      status: "issued",
      metadata: { security_test_only: true, marker: TEST_MARKER },
    })
    .select("id, verification_code")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "official document insert failed");
  return { id: inserted.id, verificationCode: inserted.verification_code };
}

function writeTestEnvFile(
  cfg: ReturnType<typeof assertSetupAllowed>,
  state: Record<string, string | undefined>,
): void {
  const outPath = resolve("tests/security/.env.local");
  mkdirSync(dirname(outPath), { recursive: true });
  const lines = [
    "# Auto-generated by setup-staging-test-accounts.ts — DO NOT COMMIT",
    `SEC_TEST_TARGET_URL=${cfg.targetUrl}`,
    `SEC_TEST_SUPABASE_URL=${cfg.supabaseUrl}`,
    `SEC_TEST_SUPABASE_ANON_KEY=${cfg.anonKey}`,
    "",
    `SEC_TEST_ADMIN_EMAIL=${state.adminEmail ?? ""}`,
    `SEC_TEST_ADMIN_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_STUDENT_A_EMAIL=${state.studentAEmail ?? ""}`,
    `SEC_TEST_STUDENT_A_PASSWORD=${cfg.password}`,
    `SEC_TEST_STUDENT_A_ID=${state.studentAId ?? ""}`,
    "",
    `SEC_TEST_STUDENT_B_EMAIL=${state.studentBEmail ?? ""}`,
    `SEC_TEST_STUDENT_B_PASSWORD=${cfg.password}`,
    `SEC_TEST_STUDENT_B_ID=${state.studentBId ?? ""}`,
    "",
    `SEC_TEST_REGISTRAR_EMAIL=${state.registrarEmail ?? ""}`,
    `SEC_TEST_REGISTRAR_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_DEAN_EMAIL=${state.deanEmail ?? ""}`,
    `SEC_TEST_DEAN_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_HR_EMAIL=${state.hrEmail ?? ""}`,
    `SEC_TEST_HR_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_FACULTY_EMAIL=${state.facultyEmail ?? ""}`,
    `SEC_TEST_FACULTY_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_STAFF_EMAIL=${state.staffEmail ?? ""}`,
    `SEC_TEST_STAFF_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_FINANCE_EMAIL=${state.financeEmail ?? ""}`,
    `SEC_TEST_FINANCE_PASSWORD=${cfg.password}`,
    "",
    `SEC_TEST_DOCUMENT_A_ID=${state.documentAId ?? ""}`,
    `SEC_TEST_DOCUMENT_B_ID=${state.documentBId ?? ""}`,
    `SEC_TEST_VALID_VERIFY_CODE=${state.validVerifyCode ?? ""}`,
    `SEC_TEST_FAKE_VERIFY_CODE=INVALID-TEST-CODE`,
    "",
    "# Optional server fn IDs — copy from staging DevTools (/_serverFn/...)",
    "SEC_TEST_FN_GET_UNOFFICIAL_TRANSCRIPT_DATA=",
    "SEC_TEST_FN_GET_STUDENT_PROGRESS=",
    "SEC_TEST_FN_LIST_AUDIT_LOGS=",
    "SEC_TEST_FN_VALIDATE_BULK_IMPORT_PREVIEW=",
    "SEC_TEST_FN_RUN_BULK_IMPORT=",
    "SEC_TEST_FN_GET_OPERATIONS_OVERVIEW=",
    "SEC_TEST_FN_GET_STUDENT_REQUEST_ATTACHMENT_URL=",
    "SEC_TEST_FN_GET_ADMIN_SESSION=",
    "",
  ];
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nWrote ${outPath} (passwords included — file is gitignored)`);
}

async function runStep(
  name: string,
  fn: () => Promise<void>,
  results: StepResult[],
): Promise<void> {
  try {
    await fn();
    results.push({ status: "PASS", name, reason: "ready" });
    logStep(results[results.length - 1]!);
  } catch (e) {
    results.push({ status: "FAIL", name, reason: (e as Error).message });
    logStep(results[results.length - 1]!);
  }
}

async function main(): Promise<number> {
  const results: StepResult[] = [];

  try {
    loadSetupEnv();
  } catch (e) {
    console.error(String((e as Error).message));
    return 1;
  }

  let cfg: ReturnType<typeof assertSetupAllowed>;
  try {
    cfg = assertSetupAllowed();
  } catch (e) {
    console.error(String((e as Error).message));
    return 1;
  }

  console.log("=== Staging Security Test Setup (ASSURANCE-03) ===");
  console.log(`Target: ${cfg.targetUrl}`);
  console.log(`Supabase: ${cfg.supabaseUrl}`);
  console.log("Writes enabled: SEC_SETUP_ALLOW_STAGING_WRITE=true\n");

  const sb = createClient<Database>(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const state: Record<string, string | undefined> = {};
  let adminUserId = "";

  const email = (key: string, fallback: string) => env(key) ?? fallback;

  state.adminEmail = email("SEC_TEST_ADMIN_EMAIL", "sec-admin@test.local");
  state.registrarEmail = email("SEC_TEST_REGISTRAR_EMAIL", "sec-registrar@test.local");
  state.deanEmail = email("SEC_TEST_DEAN_EMAIL", "sec-dean@test.local");
  state.hrEmail = email("SEC_TEST_HR_EMAIL", "sec-hr@test.local");
  state.facultyEmail = email("SEC_TEST_FACULTY_EMAIL", "sec-faculty@test.local");
  state.staffEmail = email("SEC_TEST_STAFF_EMAIL", "sec-staff@test.local");
  state.financeEmail = email("SEC_TEST_FINANCE_EMAIL", "sec-finance@test.local");
  state.studentAEmail = email("SEC_TEST_STUDENT_A_EMAIL", "sec-student-a@test.local");
  state.studentBEmail = email("SEC_TEST_STUDENT_B_EMAIL", "sec-student-b@test.local");

  await runStep("admin account", async () => {
    adminUserId = await ensureAuthUser(sb, state.adminEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-admin",
    });
    await ensureUserRole(sb, adminUserId, "admin");
  }, results);

  await runStep("system_admin account", async () => {
    const uid = await ensureAuthUser(
      sb,
      email("SEC_TEST_SYSTEM_ADMIN_EMAIL", "sec-system-admin@test.local"),
      cfg.password,
      { marker: TEST_MARKER, kind: "sec-test-system-admin" },
    );
    await ensureUserRole(sb, uid, "system_admin");
  }, results);

  await runStep("registrar account", async () => {
    const uid = await ensureAuthUser(sb, state.registrarEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-registrar",
    });
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-REG",
      full_name_ar: `${TEST_MARKER} registrar`,
      job_title: "sec-test registrar",
      role_type: "registrar",
    });
    await ensureUserRole(sb, uid, "registrar");
    await ensureCatalogRole(sb, uid, "registrar_officer", adminUserId || uid);
  }, results);

  await runStep("student_affairs account", async () => {
    const uid = await ensureAuthUser(
      sb,
      email("SEC_TEST_STUDENT_AFFAIRS_EMAIL", "sec-student-affairs@test.local"),
      cfg.password,
      { marker: TEST_MARKER, kind: "sec-test-student-affairs" },
    );
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-SAFF",
      full_name_ar: `${TEST_MARKER} student affairs`,
      job_title: "sec-test student affairs",
      role_type: "student_affairs",
    });
    await ensureUserRole(sb, uid, "student_affairs");
  }, results);

  await runStep("dean account", async () => {
    const uid = await ensureAuthUser(sb, state.deanEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-dean",
    });
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-DEAN",
      full_name_ar: `${TEST_MARKER} dean`,
      job_title: "sec-test dean",
      role_type: "dean",
    });
    await ensureUserRole(sb, uid, "dean");
  }, results);

  await runStep("vice_dean account", async () => {
    const uid = await ensureAuthUser(
      sb,
      email("SEC_TEST_VICE_DEAN_EMAIL", "sec-vice-dean@test.local"),
      cfg.password,
      { marker: TEST_MARKER, kind: "sec-test-vice-dean" },
    );
    await ensureCatalogRole(sb, uid, "vice_dean", adminUserId || uid);
    results.push({
      status: "MANUAL",
      name: "vice_dean staff profile",
      reason: "catalog role only — add staff profile manually if staff portal needed",
    });
    logStep(results[results.length - 1]!);
  }, results);

  await runStep("department_head account", async () => {
    const uid = await ensureAuthUser(
      sb,
      email("SEC_TEST_DEPARTMENT_HEAD_EMAIL", "sec-department-head@test.local"),
      cfg.password,
      { marker: TEST_MARKER, kind: "sec-test-dept-head" },
    );
    await ensureFacultyProfile(sb, uid, "SEC-FAC-HEAD");
    await ensureUserRole(sb, uid, "department_head");
    await ensureCatalogRole(sb, uid, "department_head", adminUserId || uid);
  }, results);

  await runStep("hr_officer account", async () => {
    const uid = await ensureAuthUser(sb, state.hrEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-hr",
    });
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-HR",
      full_name_ar: `${TEST_MARKER} hr`,
      job_title: "sec-test hr",
      role_type: "hr_officer",
    });
    await ensureUserRole(sb, uid, "hr_officer");
  }, results);

  await runStep("finance_officer account", async () => {
    const uid = await ensureAuthUser(sb, state.financeEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-finance",
    });
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-FIN",
      full_name_ar: `${TEST_MARKER} finance`,
      job_title: "sec-test finance",
      role_type: "finance_officer",
    });
    await ensureUserRole(sb, uid, "finance_officer");
  }, results);

  await runStep("faculty account", async () => {
    const uid = await ensureAuthUser(sb, state.facultyEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-faculty",
    });
    await ensureFacultyProfile(sb, uid, "SEC-FAC-001");
    await ensureUserRole(sb, uid, "faculty_member");
  }, results);

  await runStep("generic staff account (no privileged roles)", async () => {
    const uid = await ensureAuthUser(sb, state.staffEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-staff",
    });
    await ensureStaffProfile(sb, uid, {
      employee_number: "SEC-STAFF-GEN",
      full_name_ar: `${TEST_MARKER} staff`,
      job_title: "sec-test staff portal",
      role_type: "admin_staff",
    });
  }, results);

  await runStep("student A profile", async () => {
    const uid = await ensureAuthUser(sb, state.studentAEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-student",
    });
    state.studentAId = await ensureStudentProfile(sb, uid, ACAD_A, "A");
    await ensureUserRole(sb, uid, "student");
  }, results);

  await runStep("student B profile", async () => {
    const uid = await ensureAuthUser(sb, state.studentBEmail!, cfg.password, {
      marker: TEST_MARKER,
      kind: "sec-test-student",
    });
    state.studentBId = await ensureStudentProfile(sb, uid, ACAD_B, "B");
    await ensureUserRole(sb, uid, "student");
  }, results);

  await runStep("official document A", async () => {
    if (!state.studentAId) throw new Error("student A id missing");
    const doc = await ensureOfficialDocument(sb, state.studentAId, "A");
    state.documentAId = doc.id;
    state.validVerifyCode = doc.verificationCode;
  }, results);

  await runStep("official document B", async () => {
    if (!state.studentBId) throw new Error("student B id missing");
    const doc = await ensureOfficialDocument(sb, state.studentBId, "B");
    state.documentBId = doc.id;
  }, results);

  results.push({
    status: "MANUAL",
    name: "request attachment path B",
    reason: "upload test attachment to student-request-attachments or set SEC_TEST_ATTACHMENT_PATH_B",
  });
  logStep(results[results.length - 1]!);

  results.push({
    status: "MANUAL",
    name: "server function IDs",
    reason: "copy SEC_TEST_FN_* from staging DevTools after deploy",
  });
  logStep(results[results.length - 1]!);

  const failCount = results.filter((r) => r.status === "FAIL").length;
  if (failCount === 0) {
    writeTestEnvFile(cfg, state);
  } else {
    console.error("\nSkipped writing .env.local due to setup FAIL steps.");
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const manual = results.filter((r) => r.status === "MANUAL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n=== Setup Summary === PASS: ${pass}  FAIL: ${failCount}  SKIP: ${skip}  MANUAL: ${manual}`);

  return failCount > 0 ? 2 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
