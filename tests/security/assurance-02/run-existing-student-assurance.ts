/**
 * TEST_ONLY_ASSURANCE_02 — repeatable read-only RLS measurement for the TWO
 * synthetic students created by this phase.
 *
 * Auth mechanism: ADMIN-GENERATED SYNTHETIC TEST SESSION.
 *   auth.admin.generateLink({ type: "magiclink" }) — generates, does NOT send —
 *   followed by auth.verifyOtp({ token_hash, type: "email" }).
 * This is NOT a password login and NOT a browser session test.
 *
 * generateLink MAY CREATE a user when one is absent, so it runs only after a
 * complete live preflight proves, for BOTH pinned IDs: the auth user exists,
 * its email equals the fixture email exactly, its email is confirmed, all four
 * fixture metadata fields match, and the fixture profile row exists with a
 * matching user_id. Any discrepancy fails closed with zero generateLink calls.
 *
 * Never called here: signInWithOtp, inviteUserByEmail, createUser,
 * updateUserById, resetPasswordForEmail, any mail send, any redirect follow.
 *
 * Tokens, hashed tokens, action links and passwords live in memory only and are
 * never printed. Only non-PII evidence is reported.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ASSURANCE_02_FIXTURES, fixtureMetadata, type FixtureKey } from "./fixtures";
import { createAssuranceFetch } from "./assurance-fetch";
import {
  RequestBudget,
  evaluateDenial,
  evaluatePositiveControl,
  type DenialEvaluation,
  type HttpEvidence,
} from "./strict-evidence";
import { ASSURANCE_02_NAMESPACE, assertAllowedSupabaseOrigin } from "./target-guard";
import { readProfileById, type ManifestFile } from "./run-assurance";

/** Owner-pinned IDs. Nothing else may ever be targeted by this runner. */
export const PINNED_STUDENTS: Readonly<Record<"studentA" | "studentB", string>> = {
  studentA: "98d8a06e-6822-4501-9a68-30da597f22c8",
  studentB: "a4d5e399-0032-4178-8102-df07105f78d0",
} as const;

/** Historical tracked IDs-only manifest — read for IDs only, never exported. */
export const HISTORICAL_MANIFEST_FILE = join(
  "tests",
  "security",
  "assurance-02",
  "manifest.public.json",
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExistingStudentPreflightError extends Error {
  constructor(message: string) {
    super(`ASSURANCE_02_BLOCKED: ${message}`);
    this.name = "ExistingStudentPreflightError";
  }
}

export interface AuthUserSnapshot {
  id?: string | null;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ProfileRowSnapshot {
  id: string;
  user_id: string;
}

export interface StudentTarget {
  key: "studentA" | "studentB";
  userId: string;
  profileId: string;
  email: string;
}

/**
 * Live per-user preflight. Throws (fail closed) unless the user exists, is the
 * exact pinned ID, carries the exact fixture email, has a confirmed email and
 * matches all four fixture metadata fields.
 */
export function assertExistingFixtureUser(
  key: "studentA" | "studentB",
  pinnedUserId: string,
  snapshot: AuthUserSnapshot | null,
): void {
  const spec = ASSURANCE_02_FIXTURES.find((f) => f.key === key);
  if (!spec) throw new ExistingStudentPreflightError(`unknown fixture key ${key}`);
  if (!snapshot || !snapshot.id) {
    throw new ExistingStudentPreflightError(`${key}: auth user not found — refusing generateLink`);
  }
  if (snapshot.id !== pinnedUserId) {
    throw new ExistingStudentPreflightError(`${key}: auth user id does not equal the pinned id`);
  }
  if ((snapshot.email ?? "").toLowerCase() !== spec.email.toLowerCase()) {
    throw new ExistingStudentPreflightError(`${key}: auth email does not equal the fixture email`);
  }
  if (!snapshot.email_confirmed_at) {
    throw new ExistingStudentPreflightError(`${key}: auth email is not confirmed`);
  }
  const expected = fixtureMetadata(spec);
  const actual = snapshot.user_metadata ?? {};
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) {
      throw new ExistingStudentPreflightError(`${key}: metadata field ${field} does not match the fixture`);
    }
  }
}

/** Profile row must exist and belong to the same pinned auth user. */
export function assertFixtureProfile(
  key: "studentA" | "studentB",
  profileId: string,
  pinnedUserId: string,
  row: ProfileRowSnapshot | null,
): void {
  if (!profileId || !UUID_RE.test(profileId)) {
    throw new ExistingStudentPreflightError(`${key}: manifest profile id is not a UUID`);
  }
  if (!row) throw new ExistingStudentPreflightError(`${key}: profile row not found`);
  if (row.id !== profileId) {
    throw new ExistingStudentPreflightError(`${key}: profile row id mismatch`);
  }
  if (row.user_id !== pinnedUserId) {
    throw new ExistingStudentPreflightError(`${key}: profile user_id does not equal the pinned id`);
  }
}

/** Reads the two pinned students out of the historical IDs-only manifest. */
export function resolveTargetsFromManifest(manifest: ManifestFile): StudentTarget[] {
  if (manifest.namespace !== ASSURANCE_02_NAMESPACE || manifest.mode !== "apply") {
    throw new ExistingStudentPreflightError("manifest namespace or apply mode mismatch");
  }
  return (Object.keys(PINNED_STUDENTS) as ("studentA" | "studentB")[]).map((key) => {
    const matches = (manifest.accounts ?? []).filter((a) => a.key === (key as FixtureKey));
    if (matches.length !== 1) throw new ExistingStudentPreflightError(`${key}: expected exactly one manifest entry`);
    const account = matches[0];
    if (!account) throw new ExistingStudentPreflightError(`${key}: absent from the historical manifest`);
    if (account.userId !== PINNED_STUDENTS[key]) {
      throw new ExistingStudentPreflightError(`${key}: manifest user id does not equal the pinned id`);
    }
    const profileId = account.profileId ?? "";
    if (!UUID_RE.test(profileId)) {
      throw new ExistingStudentPreflightError(`${key}: manifest profile id is not a UUID`);
    }
    const spec = ASSURANCE_02_FIXTURES.find((f) => f.key === key)!;
    return { key, userId: PINNED_STUDENTS[key], profileId, email: spec.email };
  });
}

/**
 * Identity gate for the admin-generated session. Both the generateLink user id
 * and the verified session user id must equal the pinned existing id; anything
 * else is FAIL and can never be PASS.
 */
export function evaluateSessionIdentity(
  pinnedUserId: string,
  linkUserId: string | null | undefined,
  sessionUserId: string | null | undefined,
  evidence: HttpEvidence,
): DenialEvaluation {
  if (!linkUserId || linkUserId !== pinnedUserId) {
    return { verdict: "FAIL", reason: "generateLink user id does not equal the pinned id", evidence };
  }
  if (!sessionUserId || sessionUserId !== pinnedUserId) {
    return { verdict: "FAIL", reason: "verified session user id does not equal the pinned id", evidence };
  }
  return {
    verdict: "PASS",
    reason: "admin-generated synthetic-test session bound to the pinned existing id",
    evidence,
  };
}

/**
 * Builds evidence that keeps the adapter-measured HTTP time intact and reports
 * the harness's pacing wait separately. Pacing must never be attributed to the
 * backend.
 */
export function pacedEvidence(
  http: HttpEvidence | null,
  startedAt: number,
  now: number = Date.now(),
): HttpEvidence {
  return {
    status: http?.status ?? 0,
    html: http?.html ?? false,
    transportError: http?.transportError ?? false,
    durationMs: http?.durationMs,
    pacedElapsedMs: now - startedAt,
  };
}

export interface PreflightPorts {
  getUserById(userId: string): Promise<AuthUserSnapshot | null>;
  getProfileRow(profileId: string): Promise<ProfileRowSnapshot | null>;
}

/** Live preflight for EVERY target. Throws on the first discrepancy. */
export async function preflightAllTargets(
  ports: PreflightPorts,
  targets: readonly StudentTarget[],
): Promise<void> {
  for (const target of targets) {
    assertExistingFixtureUser(target.key, target.userId, await ports.getUserById(target.userId));
    assertFixtureProfile(
      target.key,
      target.profileId,
      target.userId,
      await ports.getProfileRow(target.profileId),
    );
  }
}

/**
 * The single gate: no session callback (and therefore no generateLink call) can
 * run until the complete preflight has passed for every pinned target.
 */
export async function gatedSessions(
  ports: PreflightPorts,
  targets: readonly StudentTarget[],
  createSession: (target: StudentTarget) => Promise<void>,
): Promise<void> {
  await preflightAllTargets(ports, targets);
  for (const target of targets) await createSession(target);
}


function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function main() {
  const supabaseUrl = assertAllowedSupabaseOrigin(requireEnv("SUPABASE_URL"));
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");

  const targets = resolveTargetsFromManifest(
    JSON.parse(readFileSync(HISTORICAL_MANIFEST_FILE, "utf8")) as ManifestFile,
  );

  // ONE shared paced/bounded adapter for every service, admin and publishable
  // request in this run.
  const net = createAssuranceFetch(supabaseUrl, new RequestBudget(30, 1000));
  const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: authOptions,
    global: { fetch: net.fetch },
  });

  const results: Record<string, DenialEvaluation> = {};
  const timings: Record<string, { status: number; durationMs: number | null; pacedElapsedMs: number }> = {};
  const sessions = new Map<"studentA" | "studentB", SupabaseClient>();
  let signOutFailures = 0;

  const note = (label: string, startedAt: number) => {
    const http = net.last();
    timings[label] = {
      status: http?.status ?? 0,
      durationMs: http?.durationMs ?? null,
      pacedElapsedMs: Date.now() - startedAt,
    };
  };

  try {
    // 1+2) COMPLETE live preflight for BOTH students, then — and only then —
    // the admin-generated sessions. A single gate owns that ordering.
    await gatedSessions(
      {
        async getUserById(userId) {
          const startedAt = Date.now();
          const got = await admin.auth.admin.getUserById(userId);
          note(`getUserById:${userId.slice(0, 8)}`, startedAt);
          if (got.error) throw new ExistingStudentPreflightError("getUserById failed");
          return (got.data?.user as AuthUserSnapshot | null) ?? null;
        },
        async getProfileRow(profileId) {
          const startedAt = Date.now();
          const profile = await admin
            .from("student_profiles")
            .select("id,user_id")
            .eq("id", profileId);
          note(`profile:${profileId.slice(0, 8)}`, startedAt);
          if (profile.error) throw new ExistingStudentPreflightError("profile read failed");
          const rows = (profile.data ?? []) as ProfileRowSnapshot[];
          return rows[0] ?? null;
        },
      },
      targets,
      async (target) => {
      const client = createClient(supabaseUrl, publishableKey, {
        auth: authOptions,
        global: { fetch: net.fetch },
      });
      let startedAt = Date.now();
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email: target.email });
      const linkEvidence = pacedEvidence(net.last(), startedAt);
      note(`generateLink:${target.key}`, startedAt);

      if (link.error) {
        results[`session:${target.key}`] = {
          verdict: "ERROR",
          reason: "generateLink did not succeed",
          evidence: linkEvidence,
        };
        return;
      }
      const hashedToken = (link.data?.properties as { hashed_token?: string } | undefined)?.hashed_token;
      const linkUserId = (link.data?.user as { id?: string } | undefined)?.id ?? null;
      if (linkUserId !== target.userId) {
        results[`session:${target.key}`] = {
          verdict: "FAIL",
          reason: "generateLink identity mismatch; token verification not attempted",
          evidence: linkEvidence,
        };
        throw new ExistingStudentPreflightError("generated link identity mismatch");
      }
      if (!hashedToken) {
        results[`session:${target.key}`] = {
          verdict: "ERROR",
          reason: "generateLink returned no hashed token",
          evidence: linkEvidence,
        };
        return;
      }

      startedAt = Date.now();
      const verified = await client.auth.verifyOtp({ token_hash: hashedToken, type: "email" });
      const sessionEvidence = pacedEvidence(net.last(), startedAt);
      note(`verifyOtp:${target.key}`, startedAt);
      const sessionUserId = verified.data?.session?.user?.id ?? null;
      if (verified.data?.session?.access_token) sessions.set(target.key, client);
      if (verified.error) {
        results[`session:${target.key}`] = {
          verdict: "ERROR",
          reason: "verifyOtp did not yield a session",
          evidence: sessionEvidence,
        };
        return;
      }
      results[`session:${target.key}`] = evaluateSessionIdentity(
        target.userId,
        linkUserId,
        sessionUserId,
        sessionEvidence,
      );
      },
    );


    // 3) Paired RLS reads on ONLY the two exact profile IDs.
    const [a, b] = targets;
    const clientA = sessions.get("studentA");
    const clientB = sessions.get("studentB");
    const identityOk =
      results["session:studentA"]?.verdict === "PASS" && results["session:studentB"]?.verdict === "PASS";
    if (!clientA || !clientB || !identityOk || !a || !b) {
      results["rls"] = {
        verdict: "BLOCKED",
        reason: "both identity-verified student sessions are required",
        evidence: { status: 0 },
      };
    } else {
      const controlA = evaluatePositiveControl(await readProfileById(clientA, a.profileId, net));
      const controlB = evaluatePositiveControl(await readProfileById(clientB, b.profileId, net));
      results["own:studentA"] = controlA;
      results["own:studentB"] = controlB;
      results["cross:A->B"] = evaluateDenial(await readProfileById(clientA, b.profileId, net), controlB);
      results["cross:B->A"] = evaluateDenial(await readProfileById(clientB, a.profileId, net), controlA);

      const anon = createClient(supabaseUrl, publishableKey, {
        auth: authOptions,
        global: { fetch: net.fetch },
      });
      results["anon:studentA"] = evaluateDenial(await readProfileById(anon, a.profileId, net), controlA);
      results["anon:studentB"] = evaluateDenial(await readProfileById(anon, b.profileId, net), controlB);
    }
  } catch (error) {
    results["preflight"] = {
      verdict: !net.budget.aborted && error instanceof ExistingStudentPreflightError ? "BLOCKED" : "ERROR",
      reason: error instanceof ExistingStudentPreflightError ? error.message : "execution failed; sensitive details suppressed",
      evidence: { status: 0 },
    };
  } finally {
    // Local-scope sign-out of the temporary sessions, through the same adapter.
    // A latched abort takes priority; any failed cleanup is a FAIL.
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
    "password-login path — the ephemeral vault was destroyed by a workspace reset; not repeatable without a password reset, which was not performed",
    "browser/session-level behaviour — this is an admin-generated synthetic-test session, not a browser login",
    "document/certificate, grade and request fixtures — none exist in this phase",
    "generic unprivileged staff principal — out of scope of this ten-account phase",
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
        namespace: ASSURANCE_02_NAMESPACE,
        authMechanism: "admin-generated synthetic-test session (generateLink + verifyOtp)",
        outcome,
        exitCode: code,
        requestsUsed: net.budget.spent,
        abortLatched: net.budget.aborted,
        signOutFailures,
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
    console.error("ASSURANCE_02_EXISTING_STUDENT_ABORTED: setup or execution failed; sensitive details suppressed");
    process.exit(1);
  });
}
