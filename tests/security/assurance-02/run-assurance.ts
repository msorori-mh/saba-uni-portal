/**
 * TEST_ONLY_ASSURANCE_02 — strict read-only assurance runner.
 *
 * NOT RUN during preparation. Executes only on explicit instruction, after the
 * fixtures have actually been created.
 *
 * Identity comes from ASSURANCE_02_FIXTURES — the single mapping. Emails are
 * never re-derived here.
 *
 * Behaviour:
 *  - manifest preflight (namespace, mode=apply, exactly the ten fixture keys,
 *    roleCreated true, auth/profile UUIDs present, vault keys matching) BEFORE
 *    the first login.
 *  - one sequential sign-in per account; a session requires BOTH an access
 *    token and a user id matching the manifest.
 *  - paired reads on ONLY the exact NEW profile IDs: own-profile positive
 *    control, cross-student A->B and B->A, then anonymous. Every read validates
 *    that the returned id equals the requested fixture id; only that boolean,
 *    the row count, status and timing are retained — never a body.
 *  - all HTTP goes through the single assurance fetch adapter, which owns the
 *    budget (<=100 requests, >=1s apart, concurrency 1), bounded timeouts,
 *    redirect refusal and the permanent abort latch.
 *  - exit 0 only when nothing failed; 1 on any FAIL/ERROR; 4 (HOLD) when the
 *    run is only BLOCKED for missing coverage.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

import { ASSURANCE_02_FIXTURES, type FixtureKey } from "./fixtures";
import { createAssuranceFetch, type AssuranceFetch } from "./assurance-fetch";
import {
  RequestBudget,
  evaluateDenial,
  evaluatePositiveControl,
  type DenialEvaluation,
  type HttpEvidence,
} from "./strict-evidence";
import { PUBLIC_MANIFEST_FILE } from "./secret-vault";
import { ASSURANCE_02_NAMESPACE, assertAllowedSupabaseOrigin } from "./target-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManifestAccount {
  key: FixtureKey;
  userId?: string;
  facultyId?: string;
  profileId?: string | null;
  roleId?: string | null;
  roleCreated?: boolean;
}

export interface ManifestFile {
  namespace?: string;
  mode?: string;
  accounts?: ManifestAccount[];
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** Full manifest + vault preflight. Throws before any network activity. */
export function preflightManifest(
  manifest: ManifestFile,
  secretKeys: readonly string[],
): ManifestAccount[] {
  if (manifest.namespace !== ASSURANCE_02_NAMESPACE) {
    throw new Error("ASSURANCE_02_BLOCKED: manifest namespace mismatch");
  }
  if (manifest.mode !== "apply") {
    throw new Error("ASSURANCE_02_BLOCKED: manifest mode is not apply (fixtures not created)");
  }
  const accounts = manifest.accounts ?? [];
  const expected = ASSURANCE_02_FIXTURES.map((f) => f.key);
  const got = accounts.map((a) => a.key);
  if (got.length !== expected.length || new Set(got).size !== expected.length) {
    throw new Error("ASSURANCE_02_BLOCKED: manifest must hold exactly ten unique fixture keys");
  }
  for (const key of expected) {
    const account = accounts.find((a) => a.key === key);
    if (!account) throw new Error(`ASSURANCE_02_BLOCKED: manifest is missing fixture ${key}`);
    if (account.roleCreated !== true) {
      throw new Error(`ASSURANCE_02_BLOCKED: fixture ${key} has roleCreated != true`);
    }
    if (!account.userId || !UUID_RE.test(account.userId)) {
      throw new Error(`ASSURANCE_02_BLOCKED: fixture ${key} has no valid auth UUID`);
    }
    if (!account.profileId || !UUID_RE.test(account.profileId)) {
      throw new Error(`ASSURANCE_02_BLOCKED: fixture ${key} has no valid profile UUID`);
    }
    if (!secretKeys.includes(key)) {
      throw new Error(`ASSURANCE_02_BLOCKED: private vault has no credential for ${key}`);
    }
  }
  return accounts;
}

/**
 * GET-only read of one exact new profile id. Returns non-PII evidence only:
 * status, PostgREST code, JSON-array validity, row count, identity match.
 */
export async function readProfileById(
  client: SupabaseClient,
  profileId: string,
  net: AssuranceFetch,
): Promise<HttpEvidence> {
  const startedAt = Date.now();
  let data: unknown = null;
  let error: { code?: string } | null = null;
  let status = 0;
  try {
    const res = await client.from("student_profiles").select("id").eq("id", profileId);
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
  const rows = Array.isArray(data) ? (data as { id?: unknown }[]) : null;
  return {
    status: status || http?.status || 0,
    html: http?.html ?? false,
    errorCode: error?.code ?? null,
    validJsonArray: rows !== null,
    rowCount: rows?.length ?? 0,
    validatedIdMatch: rows !== null && rows.length > 0 && rows.every((r) => r.id === profileId),
    // Adapter-measured HTTP+body time; the pacing wait is reported separately.
    durationMs: http?.durationMs,
    pacedElapsedMs: Date.now() - startedAt,
  };
}

export interface FinalOutcomeInput {
  results: Record<string, DenialEvaluation>;
  /** Coverage this phase cannot demonstrate; a non-empty list forces HOLD. */
  coverageBlocked: readonly string[];
  /** Non-null once the adapter permanently latched. */
  abortLatched?: string | null;
  /** Sign-out attempts that did not complete cleanly. */
  signOutFailures?: number;
}

/**
 * Final aggregation. FAIL/ERROR, a latched abort, or any sign-out failure win
 * (exit 1). Otherwise ANY blocked verdict OR any non-empty coverageBlocked list
 * yields HOLD (exit 4). Only a fully clean, fully covered run exits 0.
 */
export function finalOutcome(input: FinalOutcomeInput): { code: number; outcome: string } {
  const verdicts = Object.values(input.results).map((r) => r.verdict);
  if (verdicts.includes("FAIL") || verdicts.includes("ERROR")) {
    return { code: 1, outcome: "FAIL" };
  }
  if (input.abortLatched) return { code: 1, outcome: "FAIL" };
  if ((input.signOutFailures ?? 0) > 0) return { code: 1, outcome: "FAIL" };
  if (verdicts.includes("BLOCKED") || input.coverageBlocked.length > 0) {
    return { code: 4, outcome: "HOLD" };
  }
  return { code: 0, outcome: "PASS" };
}


async function main() {
  const secretsPath = process.argv[2];
  if (!secretsPath) throw new Error("usage: run-assurance.ts <path-to-private-credentials.json>");

  const supabaseUrl = assertAllowedSupabaseOrigin(requireEnv("SUPABASE_URL"));
  const publishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const secrets = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, string>;
  const manifest = preflightManifest(
    JSON.parse(readFileSync(PUBLIC_MANIFEST_FILE, "utf8")) as ManifestFile,
    Object.keys(secrets),
  );

  const net = createAssuranceFetch(supabaseUrl, new RequestBudget(100, 1000));
  const clientOptions = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: net.fetch },
  };

  const results: Record<string, DenialEvaluation> = {};
  const sessions = new Map<FixtureKey, SupabaseClient>();

  // 1) One sequential sign-in per account. Email comes from the fixture table.
  for (const spec of ASSURANCE_02_FIXTURES) {
    const account = manifest.find((m) => m.key === spec.key)!;
    const client = createClient(supabaseUrl, publishableKey, clientOptions);
    const startedAt = Date.now();
    let data: Awaited<ReturnType<typeof client.auth.signInWithPassword>>["data"] | null = null;
    let failed = false;
    try {
      const res = await client.auth.signInWithPassword({
        email: spec.email,
        password: secrets[spec.key] ?? "",
      });
      if (res.error) failed = true;
      data = res.data;
    } catch {
      failed = true; // never retried
    }
    const evidence: HttpEvidence = {
      ...(net.last() ?? { status: 0 }),
      pacedElapsedMs: Date.now() - startedAt,
    };
    const token = data?.session?.access_token;
    if (failed || !token || !data?.user) {
      results[`login:${spec.key}`] = { verdict: "ERROR", reason: "sign-in did not yield a session", evidence };
      continue;
    }
    if (data.user.id !== account.userId) {
      results[`login:${spec.key}`] = { verdict: "FAIL", reason: "user id mismatch", evidence };
      continue;
    }
    results[`login:${spec.key}`] = {
      verdict: "PASS",
      reason: "access token issued and identity matches manifest",
      evidence,
    };
    sessions.set(spec.key, client);
  }

  // 2) Paired own-profile controls, cross-student denials, anonymous denials.
  const a = manifest.find((m) => m.key === "studentA");
  const b = manifest.find((m) => m.key === "studentB");
  const clientA = sessions.get("studentA");
  const clientB = sessions.get("studentB");
  if (!a?.profileId || !b?.profileId || !clientA || !clientB) {
    const evidence: HttpEvidence = { status: 0 };
    results["cross-student"] = {
      verdict: "BLOCKED",
      reason: "both student sessions and profile IDs are required",
      evidence,
    };
  } else {
    const controlA = evaluatePositiveControl(await readProfileById(clientA, a.profileId, net));
    const controlB = evaluatePositiveControl(await readProfileById(clientB, b.profileId, net));
    results["own:studentA"] = controlA;
    results["own:studentB"] = controlB;
    results["cross:A->B"] = evaluateDenial(await readProfileById(clientA, b.profileId, net), controlB);
    results["cross:B->A"] = evaluateDenial(await readProfileById(clientB, a.profileId, net), controlA);

    const anon = createClient(supabaseUrl, publishableKey, clientOptions);
    results["anon:studentA"] = evaluateDenial(await readProfileById(anon, a.profileId, net), controlA);
    results["anon:studentB"] = evaluateDenial(await readProfileById(anon, b.profileId, net), controlB);
  }

  // Explicit logout of the new accounts only; counted by the same adapter.
  // Every outcome is recorded — a swallowed sign-out failure would hide a
  // latched abort or an exhausted budget.
  const signOuts: Record<
    string,
    { ok: boolean; status: number; durationMs: number | null; pacedElapsedMs: number }
  > = {};
  let signOutFailures = 0;
  for (const [key, client] of sessions.entries()) {
    const startedAt = Date.now();
    let ok = false;
    try {
      const res = await client.auth.signOut();
      ok = !res.error;
    } catch {
      ok = false; // never retried
    }
    if (!ok) signOutFailures += 1;
    const http = net.last();
    signOuts[key] = {
      ok,
      status: http?.status ?? 0,
      durationMs: http?.durationMs ?? null,
      pacedElapsedMs: Date.now() - startedAt,
    };
  }

  const coverageBlocked = [
    "document/certificate fixtures — none created in this phase",
    "grades/requests fixtures — none created in this phase",
    "server-function ID probes — IDs not supplied",
    "generic unprivileged staff principal — modelled as a staff_profile with no privileged role grant; out of scope of this ten-account phase",
  ];
  const final = finalOutcome({
    results,
    coverageBlocked,
    abortLatched: net.budget.aborted,
    signOutFailures,
  });

  console.log(
    JSON.stringify(
      {
        namespace: ASSURANCE_02_NAMESPACE,
        outcome: final.outcome,
        exitCode: final.code,
        requestsUsed: net.budget.spent,
        abortLatched: net.budget.aborted,
        signOutFailures,
        signOuts,
        results,
        coverageBlocked,
      },
      null,
      2,
    ),
  );
  process.exit(final.code);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("ASSURANCE_02_RUNNER_ABORTED: setup or execution failed; sensitive details suppressed");
    process.exit(1);
  });
}

export type { DenialEvaluation };
