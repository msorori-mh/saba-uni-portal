/**
 * TEST_ONLY_ASSURANCE_03 — grade / enrolment / request fixtures plus the actual
 * authorization measurement built on them.
 *
 * Dry run by default; fixture writes require an explicit `--apply`.
 *
 * Auth mechanism: ADMIN-GENERATED SYNTHETIC TEST SESSION
 *   auth.admin.generateLink({ type: "magiclink" }) — generates, does NOT send —
 *   followed by auth.verifyOtp({ token_hash, type: "email" }).
 * It is NOT a password login and NOT a browser session. generateLink runs only
 * after a complete live preflight proves each pinned user exists with the exact
 * fixture email, a confirmed email, all four namespace metadata fields and the
 * canonical `user_roles` row. Any discrepancy fails closed with zero
 * generateLink calls. Never called: createUser, updateUserById, signInWithOtp,
 * inviteUserByEmail, resetPasswordForEmail, any mail send, any redirect follow.
 *
 * Writes use the REGISTRAR's authenticated session (RLS `se_priv_insert` /
 * `sg_insert` genuinely allow it) and the STUDENT's own session for requests
 * (`create_student_request` then `submit_student_request`). No service-role
 * bypass of a denied legitimate path, no direct insert of submitted rows, no
 * role grants, no silent switch to admin.
 *
 * Every HTTP request from every client goes through ONE shared paced adapter.
 * Tokens live in memory only and are never printed.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

import { createAssuranceFetch, type AssuranceFetch } from "../assurance-02/assurance-fetch";
import {
  RequestBudget,
  evaluateDenial,
  evaluatePositiveControl,
  type DenialEvaluation,
  type HttpEvidence,
} from "../assurance-02/strict-evidence";
import { assertAllowedSupabaseOrigin, resolveRunMode, type RunMode } from "../assurance-02/target-guard";
import {
  ASSURANCE_03_NAMESPACE,
  ENROLLMENT_IDS,
  GRADE_IDS,
  GRADE_STATUS,
  HISTORICAL_MANIFEST_FILE,
  PINNED_EMAILS,
  PINNED_METADATA,
  PINNED_ROLES,
  PINNED_USERS,
  REFERENCE,
  REQUEST_TYPE_CODE,
  allPreallocatedIds,
  requestTitle,
  type PinnedKey,
} from "./fixtures-03";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Assurance03BlockedError extends Error {
  constructor(message: string) {
    super(`ASSURANCE_03_BLOCKED: ${message}`);
    this.name = "Assurance03BlockedError";
  }
}

export interface AuthUserSnapshot {
  id?: string | null;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Fails closed unless the pinned user is exactly the expected fixture identity. */
export function assertPinnedUser(
  key: PinnedKey,
  snapshot: AuthUserSnapshot | null,
  roles: readonly string[],
): void {
  const pinnedId = PINNED_USERS[key];
  if (!snapshot?.id) {
    throw new Assurance03BlockedError(`${key}: auth user not found — refusing generateLink`);
  }
  if (snapshot.id !== pinnedId) {
    throw new Assurance03BlockedError(`${key}: auth user id does not equal the pinned id`);
  }
  if ((snapshot.email ?? "").toLowerCase() !== PINNED_EMAILS[key].toLowerCase()) {
    throw new Assurance03BlockedError(`${key}: auth email does not equal the fixture email`);
  }
  if (!snapshot.email_confirmed_at) {
    throw new Assurance03BlockedError(`${key}: auth email is not confirmed`);
  }
  const metadata = snapshot.user_metadata ?? {};
  for (const [field, value] of Object.entries(PINNED_METADATA[key])) {
    if (metadata[field] !== value) {
      throw new Assurance03BlockedError(`${key}: metadata field ${field} does not match the fixture`);
    }
  }
  const expectedRole = PINNED_ROLES[key];
  if (roles.length !== 1 || roles[0] !== expectedRole) {
    throw new Assurance03BlockedError(
      `${key}: user_roles is not exactly ["${expectedRole}"] — refusing to proceed`,
    );
  }
}

export interface ManifestAccount {
  key: string;
  userId?: string;
  profileId?: string | null;
}
export interface ManifestFile {
  namespace?: string;
  accounts?: ManifestAccount[];
}

/** Resolves the historical IDs-only manifest profile id for a pinned key. */
export function manifestProfileId(manifest: ManifestFile, key: PinnedKey): string {
  const account = (manifest.accounts ?? []).find((a) => a.key === key);
  if (!account) throw new Assurance03BlockedError(`${key}: absent from the historical manifest`);
  if (account.userId !== PINNED_USERS[key]) {
    throw new Assurance03BlockedError(`${key}: manifest user id does not equal the pinned id`);
  }
  const profileId = account.profileId ?? "";
  if (!UUID_RE.test(profileId)) {
    throw new Assurance03BlockedError(`${key}: manifest profile id is not a UUID`);
  }
  return profileId;
}

/** Reference preflight: the two components must belong to the selected section. */
export function assertComponentsBelongToSection(
  rows: readonly { id: string; course_section_id: string }[],
): void {
  for (const component of REFERENCE.components) {
    const row = rows.find((r) => r.id === component.id);
    if (!row) throw new Assurance03BlockedError(`grade component ${component.id} not found`);
    if (row.course_section_id !== REFERENCE.sectionId) {
      throw new Assurance03BlockedError(
        `grade component ${component.id} does not belong to the selected section`,
      );
    }
  }
}

/** Collision preflight: no preallocated id and no (student, section) pair may pre-exist. */
export function assertNoCollisions(
  existingIds: readonly string[],
  existingEnrollmentsForPair: number,
): void {
  if (existingIds.length > 0) {
    throw new Assurance03BlockedError(
      `preallocated id already exists (${existingIds.length}) — refusing to write`,
    );
  }
  if (existingEnrollmentsForPair > 0) {
    throw new Assurance03BlockedError(
      "an enrolment for a pinned student in the selected section already exists — refusing to write",
    );
  }
}

/** Generic bounded read returning only non-PII evidence. */
export async function readRows(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string,
  net: AssuranceFetch,
): Promise<HttpEvidence> {
  const startedAt = Date.now();
  let data: unknown = null;
  let error: { code?: string } | null = null;
  let status = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client.from(table) as any).select(column).eq(column, value);
    data = res.data;
    error = (res.error as { code?: string } | null) ?? null;
    status = res.status;
  } catch (thrown) {
    const transport = net.last();
    return {
      ...(transport ?? { status: 0, transportError: true }),
      errorCode: (thrown as { code?: string })?.code ?? null,
      pacedElapsedMs: Date.now() - startedAt,
    };
  }
  const http = net.last();
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  return {
    status: status || http?.status || 0,
    html: http?.html ?? false,
    errorCode: error?.code ?? null,
    validJsonArray: rows !== null,
    rowCount: rows?.length ?? 0,
    validatedIdMatch: rows !== null && rows.length > 0 && rows.every((r) => r[column] === value),
    durationMs: http?.durationMs,
    pacedElapsedMs: Date.now() - startedAt,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

type StudentKey = "studentA" | "studentB";
const STUDENTS: readonly StudentKey[] = ["studentA", "studentB"];

interface Checkpoint {
  step: string;
  ids: string[];
  ok: boolean;
  detail?: string;
}

async function main() {
  const mode: RunMode = resolveRunMode(process.argv.slice(2));
  const controlsOnly = process.argv.slice(2).includes("--controls-only");
  const supabaseUrl = assertAllowedSupabaseOrigin(requireEnv("SUPABASE_URL"));
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");

  const manifest = JSON.parse(readFileSync(HISTORICAL_MANIFEST_FILE, "utf8")) as ManifestFile;
  const profileIds: Record<StudentKey, string> = {
    studentA: manifestProfileId(manifest, "studentA"),
    studentB: manifestProfileId(manifest, "studentB"),
  };

  const net = createAssuranceFetch(supabaseUrl, new RequestBudget(120, 1000));
  const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  const admin = createClient(supabaseUrl, serviceKey, { auth: authOptions, global: { fetch: net.fetch } });

  const checkpoints: Checkpoint[] = [];
  const results: Record<string, DenialEvaluation> = {};
  const timings: Record<string, { status: number; durationMs: number | null; pacedElapsedMs: number }> = {};
  const sessions = new Map<PinnedKey, SupabaseClient>();
  const created = { enrollments: [] as string[], grades: [] as string[], requests: [] as string[] };
  let signOutFailures = 0;
  let writesPerformed = 0;
  let readyToApply = false;

  const note = (label: string, startedAt: number) => {
    const http = net.last();
    timings[label] = {
      status: http?.status ?? 0,
      durationMs: http?.durationMs ?? null,
      pacedElapsedMs: Date.now() - startedAt,
    };
  };
  const cp = (step: string, ids: string[], ok: boolean, detail?: string) => {
    const entry: Checkpoint = { step, ids, ok };
    if (detail !== undefined) entry.detail = detail;
    checkpoints.push(entry);
    // Printed immediately: an ignored file cannot survive a workspace wipe.
    console.log(`CHECKPOINT ${JSON.stringify(entry)}`);
  };

  /**
   * `--controls-only` re-measures the read controls over fixtures this phase
   * already created. It performs NO write of any kind: the two request ids
   * must be supplied explicitly, and are re-verified against the fixture
   * title and owning student before any control is scored.
   */
  function pinnedExistingRequestId(key: StudentKey): string {
    const flag = key === "studentA" ? "--request-a=" : "--request-b=";
    const value = process.argv.slice(2).find((a) => a.startsWith(flag))?.slice(flag.length) ?? "";
    if (!UUID_RE.test(value)) {
      throw new Assurance03BlockedError(`controls-only run requires ${flag}<uuid>`);
    }
    return value;
  }

  try {
    // ---------------------------------------------------------------- preflight
    for (const key of Object.keys(PINNED_USERS) as PinnedKey[]) {
      let startedAt = Date.now();
      const got = await admin.auth.admin.getUserById(PINNED_USERS[key]);
      note(`getUserById:${key}`, startedAt);
      if (got.error) throw new Assurance03BlockedError(`${key}: getUserById failed`);

      startedAt = Date.now();
      const roleRes = await admin.from("user_roles").select("role").eq("user_id", PINNED_USERS[key]);
      note(`userRoles:${key}`, startedAt);
      if (roleRes.error) throw new Assurance03BlockedError(`${key}: user_roles read failed`);
      const roles = ((roleRes.data ?? []) as { role: string }[]).map((r) => r.role).sort();

      assertPinnedUser(key, (got.data?.user as AuthUserSnapshot | null) ?? null, roles);
      cp(`preflight:auth:${key}`, [PINNED_USERS[key]], true);
    }

    for (const key of STUDENTS) {
      const startedAt = Date.now();
      const res = await admin
        .from("student_profiles")
        .select("id,user_id,program_id,status")
        .eq("id", profileIds[key]);
      note(`profile:${key}`, startedAt);
      const row = ((res.data ?? []) as {
        id: string;
        user_id: string;
        program_id: string | null;
        status: string;
      }[])[0];
      if (res.error || !row) throw new Assurance03BlockedError(`${key}: profile row not readable`);
      if (row.user_id !== PINNED_USERS[key]) {
        throw new Assurance03BlockedError(`${key}: profile user_id does not equal the pinned id`);
      }
      if (row.program_id !== REFERENCE.programId) {
        throw new Assurance03BlockedError(`${key}: profile program does not match the 04B offering program`);
      }
      if (row.status !== "active") {
        throw new Assurance03BlockedError(`${key}: profile status is not active`);
      }
      cp(`preflight:profile:${key}`, [row.id], true);
    }

    // Reference preflight — components must belong to the selected section.
    let startedAt = Date.now();
    const comps = await admin
      .from("grade_components")
      .select("id,course_section_id,max_score")
      .in("id", REFERENCE.components.map((c) => c.id));
    note("referenceComponents", startedAt);
    if (comps.error) throw new Assurance03BlockedError("grade_components read failed");
    const compRows = (comps.data ?? []) as { id: string; course_section_id: string; max_score: number }[];
    assertComponentsBelongToSection(compRows);
    for (const component of REFERENCE.components) {
      const row = compRows.find((r) => r.id === component.id)!;
      if (Number(row.max_score) !== component.maxScore || component.score > component.maxScore) {
        throw new Assurance03BlockedError(`component ${component.id} max_score/score bound mismatch`);
      }
    }
    cp("preflight:components", REFERENCE.components.map((c) => c.id), true);

    // Collision preflight — never upsert, never touch an old row.
    startedAt = Date.now();
    const existingEnr = await admin
      .from("student_enrollments")
      .select("id,student_profile_id")
      .in("id", Object.values(ENROLLMENT_IDS));
    note("collision:enrollmentIds", startedAt);
    startedAt = Date.now();
    const existingPair = await admin
      .from("student_enrollments")
      .select("id")
      .eq("course_section_id", REFERENCE.sectionId)
      .in("student_profile_id", [profileIds.studentA, profileIds.studentB]);
    note("collision:pair", startedAt);
    startedAt = Date.now();
    const existingGrades = await admin
      .from("student_grades")
      .select("id")
      .in("id", Object.values(GRADE_IDS).flatMap((p) => [...p]));
    note("collision:gradeIds", startedAt);
    if (existingEnr.error || existingPair.error || existingGrades.error) {
      throw new Assurance03BlockedError("collision preflight read failed");
    }
    if (controlsOnly) {
      // Re-measuring controls over fixtures this phase already created: the
      // preallocated ids MUST already be present, and nothing is written.
      const present = [
        ...((existingEnr.data ?? []) as { id: string }[]).map((r) => r.id),
        ...((existingGrades.data ?? []) as { id: string }[]).map((r) => r.id),
      ];
      if (present.length !== allPreallocatedIds().length) {
        throw new Assurance03BlockedError("controls-only run: expected fixture rows are not all present");
      }
      cp("preflight:fixturesPresent", present.sort(), true, "no write attempted");
    } else {
      assertNoCollisions(
        [
          ...((existingEnr.data ?? []) as { id: string }[]).map((r) => r.id),
          ...((existingGrades.data ?? []) as { id: string }[]).map((r) => r.id),
        ],
        ((existingPair.data ?? []) as unknown[]).length,
      );
      cp("preflight:collisions", allPreallocatedIds(), true, "none present");
    }

    readyToApply = true;
    if (mode !== "apply" && !controlsOnly) {
      cp("dryrun:complete", [], true, "no writes attempted");
    } else {
      // ------------------------------------------------------------- sessions
      for (const key of Object.keys(PINNED_USERS) as PinnedKey[]) {
        const client = createClient(supabaseUrl, publishableKey, {
          auth: authOptions,
          global: { fetch: net.fetch },
        });
        let started = Date.now();
        const link = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: PINNED_EMAILS[key],
        });
        note(`generateLink:${key}`, started);
        const linkUserId = (link.data?.user as { id?: string } | undefined)?.id ?? null;
        const hashedToken = (link.data?.properties as { hashed_token?: string } | undefined)?.hashed_token;
        if (link.error || !hashedToken) {
          throw new Assurance03BlockedError(`${key}: generateLink did not yield a token`);
        }
        // Identity is checked BEFORE the token is verified.
        if (linkUserId !== PINNED_USERS[key]) {
          throw new Assurance03BlockedError(`${key}: generateLink user id does not equal the pinned id`);
        }
        started = Date.now();
        const verified = await client.auth.verifyOtp({ token_hash: hashedToken, type: "email" });
        note(`verifyOtp:${key}`, started);
        // Session collected immediately so cleanup happens even on mismatch.
        if (verified.data?.session?.access_token) sessions.set(key, client);
        if (verified.error || verified.data?.session?.user?.id !== PINNED_USERS[key]) {
          throw new Assurance03BlockedError(`${key}: verified session identity mismatch`);
        }
        cp(`session:${key}`, [PINNED_USERS[key]], true, "admin-generated synthetic-test session");
      }

      const registrar = sessions.get("registrar")!;

      // --------------------------------------------------- enrolments (registrar)
      for (const key of controlsOnly ? [] : STUDENTS) {
        const id = ENROLLMENT_IDS[key];
        cp(`pre-write:enrollment:${key}`, [id], true, "id preallocated");
        const started = Date.now();
        const res = await registrar
          .from("student_enrollments")
          .insert({
            id,
            student_profile_id: profileIds[key],
            course_section_id: REFERENCE.sectionId,
            enrollment_status: "enrolled",
          })
          .select("id");
        note(`insert:enrollment:${key}`, started);
        const returned = ((res.data ?? []) as { id: string }[])[0]?.id ?? null;
        if (res.error || returned !== id) {
          cp(`write:enrollment:${key}`, [id], false, res.error?.code ?? "id mismatch");
          throw new Assurance03BlockedError(
            `${key}: registrar could not create the enrolment (${res.error?.code ?? "no row"})`,
          );
        }
        writesPerformed += 1;
        created.enrollments.push(id);
        cp(`write:enrollment:${key}`, [id], true);
      }

      // ------------------------------------------------------- grades (registrar)
      for (const key of controlsOnly ? [] : STUDENTS) {
        const ids = GRADE_IDS[key];
        for (let i = 0; i < REFERENCE.components.length; i += 1) {
          const component = REFERENCE.components[i]!;
          const id = ids[i]!;
          cp(`pre-write:grade:${key}:${i}`, [id], true, "id preallocated");
          const started = Date.now();
          const res = await registrar
            .from("student_grades")
            .insert({
              id,
              student_enrollment_id: ENROLLMENT_IDS[key],
              grade_component_id: component.id,
              score: component.score,
              status: GRADE_STATUS,
              entered_by: PINNED_USERS.registrar,
            })
            .select("id");
          note(`insert:grade:${key}:${i}`, started);
          const returned = ((res.data ?? []) as { id: string }[])[0]?.id ?? null;
          if (res.error || returned !== id) {
            cp(`write:grade:${key}:${i}`, [id], false, res.error?.code ?? "id mismatch");
            throw new Assurance03BlockedError(
              `${key}: registrar could not create the grade (${res.error?.code ?? "no row"})`,
            );
          }
          writesPerformed += 1;
          created.grades.push(id);
          cp(`write:grade:${key}:${i}`, [id], true);
        }
      }

      // ------------------------------------------- requests (student's own session)
      const requestIds: Record<StudentKey, string | null> = controlsOnly
        ? {
            studentA: pinnedExistingRequestId("studentA"),
            studentB: pinnedExistingRequestId("studentB"),
          }
        : { studentA: null, studentB: null };
      for (const key of controlsOnly ? [] : STUDENTS) {
        const client = sessions.get(key)!;
        let started = Date.now();
        const createRes = await client.rpc("create_student_request", {
          p_request_type: REQUEST_TYPE_CODE,
          p_title: requestTitle(key),
          p_form_data: { namespace: ASSURANCE_03_NAMESPACE },
          p_student_notes: `${ASSURANCE_03_NAMESPACE} synthetic inquiry`,
        });
        note(`rpc:create_student_request:${key}`, started);
        const newId = (createRes.data as string | null) ?? null;
        if (createRes.error || !newId || !UUID_RE.test(newId)) {
          cp(`write:request:${key}`, [], false, createRes.error?.code ?? "no id returned");
          throw new Assurance03BlockedError(
            `${key}: create_student_request failed (${createRes.error?.message ?? "no id"})`,
          );
        }
        writesPerformed += 1;
        requestIds[key] = newId;
        created.requests.push(newId);
        cp(`write:request:${key}`, [newId], true, "draft created via RPC");

        started = Date.now();
        const submitRes = await client.rpc("submit_student_request", { p_request_id: newId });
        note(`rpc:submit_student_request:${key}`, started);
        if (submitRes.error) {
          cp(`submit:request:${key}`, [newId], false, submitRes.error.code ?? "submit error");
          throw new Assurance03BlockedError(
            `${key}: submit_student_request failed (${submitRes.error.message})`,
          );
        }
        cp(`submit:request:${key}`, [newId], true, "submitted; no retry attempted");
      }

      if (controlsOnly) {
        // Prove the supplied ids are exactly this phase's own fixtures before
        // they are used as controls: right owner, right namespace title.
        for (const key of STUDENTS) {
          const startedRead = Date.now();
          const res = await admin
            .from("student_requests")
            .select("id,student_profile_id,title,status")
            .eq("id", requestIds[key]!);
          note(`verifyRequest:${key}`, startedRead);
          const row = ((res.data ?? []) as {
            id: string;
            student_profile_id: string;
            title: string;
            status: string;
          }[])[0];
          if (res.error || !row) throw new Assurance03BlockedError(`${key}: supplied request id not found`);
          if (row.student_profile_id !== profileIds[key] || row.title !== requestTitle(key)) {
            throw new Assurance03BlockedError(`${key}: supplied request id is not this phase's fixture`);
          }
          cp(`controls:requestPinned:${key}`, [row.id], true, `status=${row.status}`);
        }
      }

      // --------------------------------------------------------------- controls
      const clientA = sessions.get("studentA")!;
      const clientB = sessions.get("studentB")!;
      const anon = createClient(supabaseUrl, publishableKey, {
        auth: authOptions,
        global: { fetch: net.fetch },
      });

      const owners: Record<StudentKey, SupabaseClient> = { studentA: clientA, studentB: clientB };
      const others: Record<StudentKey, SupabaseClient> = { studentA: clientB, studentB: clientA };

      for (const key of STUDENTS) {
        const enrollmentId = ENROLLMENT_IDS[key];
        const gradeId = GRADE_IDS[key][0];
        const requestId = requestIds[key]!;

        const enrControl = evaluatePositiveControl(
          await readRows(owners[key], "student_enrollments", "id", enrollmentId, net),
        );
        results[`own:enrollment:${key}`] = enrControl;
        const gradeControl = evaluatePositiveControl(
          await readRows(owners[key], "student_grades", "id", gradeId, net),
        );
        results[`own:grade:${key}`] = gradeControl;
        const transcriptControl = evaluatePositiveControl(
          await readRows(owners[key], "student_unofficial_transcript", "enrollment_id", enrollmentId, net),
        );
        results[`own:transcript:${key}`] = transcriptControl;
        const requestControl = evaluatePositiveControl(
          await readRows(owners[key], "student_requests", "id", requestId, net),
        );
        results[`own:request:${key}`] = requestControl;

        results[`cross:enrollment:${key}`] = evaluateDenial(
          await readRows(others[key], "student_enrollments", "id", enrollmentId, net),
          enrControl,
        );
        results[`cross:grade:${key}`] = evaluateDenial(
          await readRows(others[key], "student_grades", "id", gradeId, net),
          gradeControl,
        );
        results[`cross:transcript:${key}`] = evaluateDenial(
          await readRows(others[key], "student_unofficial_transcript", "enrollment_id", enrollmentId, net),
          transcriptControl,
        );
        results[`cross:request:${key}`] = evaluateDenial(
          await readRows(others[key], "student_requests", "id", requestId, net),
          requestControl,
        );

        results[`anon:enrollment:${key}`] = evaluateDenial(
          await readRows(anon, "student_enrollments", "id", enrollmentId, net),
          enrControl,
        );
        results[`anon:grade:${key}`] = evaluateDenial(
          await readRows(anon, "student_grades", "id", gradeId, net),
          gradeControl,
        );
        results[`anon:request:${key}`] = evaluateDenial(
          await readRows(anon, "student_requests", "id", requestId, net),
          requestControl,
        );

        // Correct-role positive control: the registrar is authorized to read.
        results[`registrar:enrollment:${key}`] = evaluatePositiveControl(
          await readRows(registrar, "student_enrollments", "id", enrollmentId, net),
        );
        results[`registrar:grade:${key}`] = evaluatePositiveControl(
          await readRows(registrar, "student_grades", "id", gradeId, net),
        );
        results[`registrar:request:${key}`] = evaluatePositiveControl(
          await readRows(registrar, "student_requests", "id", requestId, net),
        );
      }
    }
  } catch (error) {
    results["run"] = {
      verdict: net.budget.aborted ? "ERROR" : "BLOCKED",
      reason: (error as Error).message,
      evidence: { status: 0 },
    };
  } finally {
    for (const [key, client] of sessions.entries()) {
      const startedAt = Date.now();
      let ok = false;
      try {
        if (net.budget.aborted) throw new Error("abort latched");
        const res = await client.auth.signOut({ scope: "local" });
        ok = !res.error;
      } catch {
        ok = false; // never retried
      }
      if (!ok) signOutFailures += 1;
      note(`signOut:${key}`, startedAt);
    }
  }

  const coverageBlocked = [
    "official document issuance — this backend has no request type or workflow containing a document_issuance step; no document was created",
    "staff workflow authorization — the free TEST_ONLY request type has no active workflow, so no staff step exists to authorize",
    "generic unprivileged staff principal — no such fixture exists in the A02 namespace",
    "password-login and browser-session behaviour — admin-generated synthetic-test sessions only",
  ];
  const verdicts = Object.values(results).map((r) => r.verdict);
  const failed =
    verdicts.includes("FAIL") ||
    verdicts.includes("ERROR") ||
    Boolean(net.budget.aborted) ||
    signOutFailures > 0;
  const outcome = failed ? "FAIL" : "HOLD";
  const code = failed ? 1 : 4;

  console.log(
    JSON.stringify(
      {
        namespace: ASSURANCE_03_NAMESPACE,
        mode,
        authMechanism: "admin-generated synthetic-test session (generateLink + verifyOtp)",
        outcome,
        exitCode: code,
        readyToApply,
        writesPerformed,
        created,
        requestsUsed: net.budget.spent,
        abortLatched: net.budget.aborted,
        signOutFailures,
        checkpoints,
        timings,
        results,
        coverageBlocked,
      },
      null,
      2,
    ),
  );
  process.exit(code);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ASSURANCE_03_ABORTED: ${(error as Error).message}`);
    process.exit(1);
  });
}

