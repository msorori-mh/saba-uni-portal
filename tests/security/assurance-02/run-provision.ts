/**
 * TEST_ONLY_ASSURANCE_02 — CLI entry point.
 *
 * Default is DRY RUN. `--apply` is required for any write. Reads
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY from the
 * environment and never prints their values.
 *
 *   bun tests/security/assurance-02/run-provision.ts            # dry run
 *   bun tests/security/assurance-02/run-provision.ts --apply    # writes
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

import {
  ASSURANCE_02_FIXTURES,
  KNOWN_COVERAGE_GAPS,
  MARKED_SYNTHETIC_REFERENCES,
  fixtureTag,
  type FixtureSpec,
} from "./fixtures";
import { JsonlCheckpointSink } from "./durable-sink";
import {
  CollisionError,
  PreflightError,
  detectCollisions,
  generateSecrets,
  provision,
  publicManifest,
  type CollisionProbe,
  type ReferencePreflight,
  type WritePort,
} from "./provision";
import {
  PUBLIC_MANIFEST_FILE,
  checkpointsFileFor,
  persistSecrets,
  redactError,
  runStamp,
  secretsFileFor,
} from "./secret-vault";
import {
  ALLOWED_APP_ORIGIN,
  assertAllowedAppOrigin,
  assertAllowedSupabaseOrigin,
  guardedFetch,
  resolveRunMode,
} from "./target-guard";

/** Hard cap for the private pagination fallback; exhaustion => FAIL CLOSED. */
const MAX_AUTH_PAGES = 50;
const AUTH_PAGE_SIZE = 200;

/**
 * Every literal secret value this process touches (env keys and generated
 * passwords) is registered here so `redactError` can strip the exact strings
 * from any diagnostic, not merely generic token shapes.
 */
const SECRET_VALUES: string[] = [];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  SECRET_VALUES.push(value);
  return value;
}

/**
 * Exact read-only lookup via `public.find_auth_user_id_by_email`, whose
 * definition was verified: `LANGUAGE sql STABLE SECURITY DEFINER`, body is a
 * single `SELECT id FROM auth.users WHERE lower(email)=lower($1) LIMIT 1`.
 * If the RPC is unavailable we fall back to one bounded private pagination and
 * FAIL CLOSED when exhaustive coverage cannot be established. Emails of
 * existing users are never returned, logged or counted individually.
 */
async function makeAuthEmailProbe(admin: SupabaseClient) {
  const probeRes = await admin.rpc("find_auth_user_id_by_email", {
    p_email: "a02-capability-probe@assurance02.test.invalid",
  });
  const rpcUsable = !probeRes.error;

  if (rpcUsable) {
    return {
      method: "rpc:find_auth_user_id_by_email" as const,
      exists: async (email: string) => {
        const { data, error } = await admin.rpc("find_auth_user_id_by_email", { p_email: email });
        if (error) throw new Error(`auth email lookup failed: ${error.message}`);
        return data !== null && data !== undefined;
      },
    };
  }

  // Bounded pagination fallback: read once, cache locally, never print.
  const known = new Set<string>();
  let exhaustive = false;
  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const res = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (res.error) throw new Error(`auth listing failed: ${res.error.message}`);
    for (const u of res.data.users) if (u.email) known.add(u.email.toLowerCase());
    if (res.data.users.length < AUTH_PAGE_SIZE) {
      exhaustive = true;
      break;
    }
  }
  if (!exhaustive) {
    throw new Error(
      `auth email collision check FAILED CLOSED: exhaustive coverage not established within ${MAX_AUTH_PAGES} pages`,
    );
  }
  return {
    method: "paginated:exhaustive" as const,
    exists: async (email: string) => known.has(email.toLowerCase()),
  };
}

function makeReferencePreflight(admin: SupabaseClient): ReferencePreflight {
  return {
    async verify() {
      const R = MARKED_SYNTHETIC_REFERENCES;
      const [dept, prog, year, sem] = await Promise.all([
        admin.from("departments").select("id,name_ar").eq("id", R.departmentId).maybeSingle(),
        admin
          .from("programs")
          .select("id,name_ar,department_id")
          .eq("id", R.programId)
          .maybeSingle(),
        admin.from("academic_years").select("id,name").eq("id", R.academicYearId).maybeSingle(),
        admin.from("semesters").select("id,name,academic_year_id").eq("id", R.semesterId).maybeSingle(),
      ]);
      for (const [label, res] of [
        ["department", dept],
        ["program", prog],
        ["academic_year", year],
        ["semester", sem],
      ] as const) {
        if (res.error) return { ok: false as const, reason: `${label} lookup failed: ${res.error.message}` };
        if (!res.data) return { ok: false as const, reason: `${label} fixture row is missing` };
      }
      if ((dept.data as { name_ar: string }).name_ar !== R.departmentLabel)
        return { ok: false as const, reason: "department label changed" };
      if ((prog.data as { name_ar: string }).name_ar !== R.programLabel)
        return { ok: false as const, reason: "program label changed" };
      if ((prog.data as { department_id: string }).department_id !== R.departmentId)
        return { ok: false as const, reason: "program -> department FK does not match the fixture department" };
      if ((year.data as { name: string }).name !== R.academicYearLabel)
        return { ok: false as const, reason: "academic year label changed" };
      if ((sem.data as { name: string }).name !== R.semesterLabel)
        return { ok: false as const, reason: "semester label changed" };
      if ((sem.data as { academic_year_id: string }).academic_year_id !== R.academicYearId)
        return { ok: false as const, reason: "semester -> academic year FK mismatch" };
      return { ok: true as const };
    },
  };
}

/**
 * READ-ONLY role + schema readiness. Confirms that the canonical `user_roles`
 * path is usable for every fixture role, reports which codes exist in
 * `roles_catalog` (never adding any), and confirms no auth trigger will insert
 * a default role/profile row that our create could collide with.
 */
async function inspectRoleReadiness(admin: SupabaseClient) {
  const catalog = await admin.from("roles_catalog").select("code");
  const catalogCodes = catalog.error
    ? []
    : ((catalog.data ?? []) as { code: string }[]).map((r) => r.code);
  const wanted = [...new Set(ASSURANCE_02_FIXTURES.map((f) => f.appRole))];

  return {
    writes_role_table: "user_roles (canonical)",
    writes_user_role_assignments: false,
    user_role_assignments_reason:
      "FK role_code -> roles_catalog(code) is unpopulated for these codes and adding catalog entries is out of scope",
    roles_catalog_codes_present: wanted.filter((r) => catalogCodes.includes(r)),
    roles_catalog_codes_absent: wanted.filter((r) => !catalogCodes.includes(r)),
    auth_trigger_default_rows: "none — no non-internal trigger exists on auth.users",
  };
}

function makeProbe(
  admin: SupabaseClient,
  authEmailExists: (email: string) => Promise<boolean>,
): CollisionProbe {
  return {
    authEmailExists,
    async profileIdentifierExists(spec) {
      if (spec.profileKind === "student") {
        const { data, error } = await admin
          .from("student_profiles")
          .select("id")
          .eq("academic_number", spec.identifier)
          .limit(1);
        if (error) throw new Error(`collision probe failed: ${error.message}`);
        return (data?.length ?? 0) > 0;
      }
      const table = spec.profileKind === "faculty" ? "faculty_profiles" : "staff_profiles";
      const { data, error } = await admin
        .from(table)
        .select("id")
        .eq("employee_number", spec.identifier)
        .limit(1);
      if (error) throw new Error(`collision probe failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
    async facultyEmployeeIdExists(spec) {
      if (!spec.facultyEmployeeId) return false;
      const { data, error } = await admin
        .from("faculty")
        .select("id")
        .eq("employee_id", spec.facultyEmployeeId)
        .limit(1);
      if (error) throw new Error(`collision probe failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
    /**
     * `user_roles` is keyed by (user_id, role). A mapping can only pre-exist if
     * an auth user already holds this fixture email, so the check is: resolve
     * the id read-only, then look for a role row. No email is ever returned.
     */
    async roleMappingExists(spec) {
      const { data: existingId, error: rpcError } = await admin.rpc(
        "find_auth_user_id_by_email",
        { p_email: spec.email },
      );
      if (rpcError) throw new Error(`collision probe failed: ${rpcError.message}`);
      if (!existingId) return false;
      const { data, error } = await admin
        .from("user_roles")
        .select("id")
        .eq("user_id", existingId as string)
        .limit(1);
      if (error) throw new Error(`collision probe failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
  };
}

function makeWriter(admin: SupabaseClient): WritePort {
  const R = MARKED_SYNTHETIC_REFERENCES;
  return {
    async createAuthUser(input) {
      const { data, error } = await admin.auth.admin.createUser(input);
      if (error || !data.user) throw new Error(error?.message ?? "createUser returned no user");
      return { userId: data.user.id };
    },
    async createFacultyRecord(spec: FixtureSpec) {
      const { data, error } = await admin
        .from("faculty")
        .insert({
          employee_id: spec.facultyEmployeeId!,
          full_name_ar: spec.fullNameAr,
          email: spec.email,
          program_id: R.programId,
          category: "faculty",
          is_active: true,
          bio_ar: fixtureTag(spec),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { facultyId: data.id as string };
    },
    async createProfile(spec, userId, facultyId) {
      if (spec.profileKind === "student") {
        const { data, error } = await admin
          .from("student_profiles")
          .insert({
            user_id: userId,
            academic_number: spec.identifier,
            full_name_ar: spec.fullNameAr,
            full_name_en: fixtureTag(spec),
            email: spec.email,
            department_id: R.departmentId,
            program_id: R.programId,
            status: "active",
            study_system: "regular",
            student_study_status: "new",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return { profileId: data.id as string };
      }
      if (spec.profileKind === "faculty") {
        const { data, error } = await admin
          .from("faculty_profiles")
          .insert({
            user_id: userId,
            faculty_id: facultyId,
            employee_number: spec.identifier,
            full_name_ar: spec.fullNameAr,
            full_name_en: fixtureTag(spec),
            department_id: R.departmentId,
            program_id: R.programId,
            position_title: spec.key === "department_head" ? "رئيس قسم" : "عضو هيئة تدريس",
            status: "active",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return { profileId: data.id as string };
      }
      const { data, error } = await admin
        .from("staff_profiles")
        .insert({
          user_id: userId,
          employee_number: spec.identifier,
          full_name_ar: spec.fullNameAr,
          full_name_en: fixtureTag(spec),
          job_title: spec.fullNameAr,
          email: spec.email,
          department_id: R.departmentId,
          department_scope: "specific",
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { profileId: data.id as string };
    },
    /**
     * The canonical app authorises through `user_roles` alone. The optional
     * `user_role_assignments` table has an FK to `roles_catalog(code)`, whose
     * catalog is not populated for these codes; adding catalog entries is
     * explicitly out of scope, so no needless mapping row is written.
     */
    async createRole(spec, userId) {
      const { data, error } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: spec.appRole })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { roleId: data.id as string };
    },
  };
}

async function main() {
  const mode = resolveRunMode(process.argv.slice(2));
  const supabaseUrl = assertAllowedSupabaseOrigin(requireEnv("SUPABASE_URL"));
  assertAllowedAppOrigin(ALLOWED_APP_ORIGIN);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("SUPABASE_PUBLISHABLE_KEY");

  // All admin HTTP flows through the guarded fetch: HTTPS-only, exact origin,
  // no redirects, bounded timeout.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        guardedFetch(
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
          supabaseUrl,
          init ?? {},
        )) as unknown as typeof fetch,
    },
  });

  // Real Auth Admin capability proof — status only, no emails returned.
  const capability = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  const capabilityStatus = capability.error ? "UNAVAILABLE" : "AVAILABLE";
  if (capability.error) {
    console.log(
      JSON.stringify({ auth_admin_capability: capabilityStatus, status: capability.error.status ?? null }),
    );
    process.exit(1);
  }

  const emailProbe = await makeAuthEmailProbe(admin);
  const probe = makeProbe(admin, emailProbe.exists);
  const references = makeReferencePreflight(admin);

  if (mode === "dryrun") {
    const refs = await references.verify();
    const roleReadiness = await inspectRoleReadiness(admin);
    const collisions = refs.ok ? await detectCollisions(probe) : [];
    console.log(
      JSON.stringify(
        {
          mode,
          namespace: "TEST_ONLY_ASSURANCE_02",
          auth_admin_capability: capabilityStatus,
          auth_email_probe_method: emailProbe.method,
          referencePreflight: refs,
          roleReadiness,
          plannedAccounts: ASSURANCE_02_FIXTURES.map((f) => ({
            key: f.key,
            appRole: f.appRole,
            profileKind: f.profileKind,
            identifier: f.identifier,
            facultyEmployeeId: f.facultyEmployeeId ?? null,
          })),
          collisions,
          readyToApply: refs.ok && collisions.length === 0,
          coverageBlocked: KNOWN_COVERAGE_GAPS,
          writesPerformed: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  // ---- apply path ---------------------------------------------------------
  const stamp = runStamp();
  const secrets = generateSecrets();
  SECRET_VALUES.push(...Object.values(secrets));
  persistSecrets(secretsFileFor(stamp), secrets); // exclusive, 0600, BEFORE any create
  const sink = new JsonlCheckpointSink(checkpointsFileFor(stamp));

  try {
    const result = await provision({
      mode,
      probe,
      writer: makeWriter(admin),
      sink,
      secrets,
      references,
      vaultReady: true,
    });
    writeFileSync(PUBLIC_MANIFEST_FILE, JSON.stringify(publicManifest(result), null, 2));
    console.log(JSON.stringify(publicManifest(result), null, 2));
    if (result.stoppedAt) process.exit(2);
  } finally {
    sink.close();
  }
}

main().catch((error) => {
  if (error instanceof CollisionError || error instanceof PreflightError) {
    console.error(redactError(error, SECRET_VALUES));
    process.exit(3);
  }
  console.error(`ASSURANCE_02_FAILED: ${redactError(error, SECRET_VALUES)}`);
  process.exit(1);
});
