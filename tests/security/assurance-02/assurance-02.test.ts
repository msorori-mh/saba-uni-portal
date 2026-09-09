/**
 * TEST_ONLY_ASSURANCE_02 — offline unit tests.
 * Pure: no network, no database, no writes outside a temp dir.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ALLOWED_APP_ORIGIN,
  ALLOWED_SUPABASE_ORIGIN,
  assertAllowedAppOrigin,
  assertAllowedSupabaseOrigin,
  assertRequestUrl,
  guardedFetch,
  resolveRunMode,
} from "./target-guard";
import { ASSURANCE_02_FIXTURES, KNOWN_COVERAGE_GAPS } from "./fixtures";
import {
  CollisionError,
  PreflightError,
  generateSecrets,
  provision,
  publicManifest,
  type CollisionProbe,
  type ReferencePreflight,
  type WritePort,
} from "./provision";
import { JsonlCheckpointSink, MemoryCheckpointSink, SinkError } from "./durable-sink";
import { generatePassword, persistSecrets, redactError, VaultError } from "./secret-vault";
import {
  RequestBudget,
  evaluateDenial,
  evaluatePositiveControl,
  isInfrastructureFailure,
} from "./strict-evidence";
import { createAssuranceFetch } from "./assurance-fetch";
import { finalOutcome, preflightManifest, readProfileById } from "./run-assurance";

const noCollisions: CollisionProbe = {
  authEmailExists: async () => false,
  profileIdentifierExists: async () => false,
  facultyEmployeeIdExists: async () => false,
  roleMappingExists: async () => false,
};

const okRefs: ReferencePreflight = { verify: async () => ({ ok: true }) };

function recordingWriter(opts: { failAuthFor?: string; failProfileFor?: string } = {}) {
  const calls: string[] = [];
  let n = 0;
  const writer: WritePort = {
    async createAuthUser(input) {
      calls.push(`auth:${input.email}`);
      if (opts.failAuthFor && input.email.includes(opts.failAuthFor)) throw new Error("simulated auth failure");
      return { userId: `uid-${++n}` };
    },
    async createFacultyRecord(spec) {
      calls.push(`faculty:${spec.key}`);
      return { facultyId: `fac-${spec.key}` };
    },
    async createProfile(spec, userId, facultyId) {
      calls.push(`profile:${spec.key}:${userId}:${facultyId ?? "-"}`);
      if (opts.failProfileFor && spec.key === opts.failProfileFor) throw new Error("simulated profile failure");
      return { profileId: `pid-${spec.key}` };
    },
    async createRole(spec, userId) {
      calls.push(`role:${spec.key}:${userId}`);
      return { roleId: `role-${spec.key}` };
    },
  };
  return { writer, calls };
}

function baseOpts(extra: Partial<Parameters<typeof provision>[0]> = {}) {
  const { writer, calls } = recordingWriter();
  return {
    opts: {
      mode: "apply" as const,
      probe: noCollisions,
      writer,
      sink: new MemoryCheckpointSink(),
      secrets: generateSecrets(),
      references: okRefs,
      vaultReady: true,
      ...extra,
    },
    calls,
  };
}

describe("target guard", () => {
  it("accepts the canonical origins and one trailing slash", () => {
    expect(assertAllowedSupabaseOrigin(ALLOWED_SUPABASE_ORIGIN)).toBe(ALLOWED_SUPABASE_ORIGIN);
    expect(assertAllowedAppOrigin(`${ALLOWED_APP_ORIGIN}/`)).toBe(ALLOWED_APP_ORIGIN);
  });

  it("rejects production identities", () => {
    expect(() => assertAllowedSupabaseOrigin("https://wpmicqriltrowwonknox.supabase.co")).toThrow(
      /production identity/,
    );
    expect(() => assertAllowedAppOrigin("https://quboolye.com")).toThrow(/production identity/);
  });

  it("rejects malformed and evasive origin variants", () => {
    for (const bad of [
      "https://uniportaltest.com:443",
      "https://uniportaltest.com?",
      "https://uniportaltest.com#",
      "https://uniportaltest.com/./",
      "https://uniportaltest.com/a/..",
      "https://uniportaltest.com/%2e%2e/",
      "https://uniportaltest.com//",
      "https:\\\\uniportaltest.com",
      "https://user:pw@uniportaltest.com",
      "https://uniportaltest.com.evil.example",
      "https://UNIPORTALTEST.com",
      "http://uniportaltest.com",
      "//uniportaltest.com",
      " https://uniportaltest.com/x",
      "",
      "not-a-url",
      42 as unknown as string,
      null as unknown as string,
    ]) {
      expect(() => assertAllowedAppOrigin(bad)).toThrow(/ASSURANCE_02_TARGET_REJECTED/);
    }
  });

  it("keeps request URLs inside the allowed origin", () => {
    expect(assertRequestUrl(`${ALLOWED_APP_ORIGIN}/privacy`, ALLOWED_APP_ORIGIN)).toContain("/privacy");
    expect(() => assertRequestUrl("https://evil.example/x", ALLOWED_APP_ORIGIN)).toThrow();
    expect(() => assertRequestUrl("https://uniportaltest.com:8443/x", ALLOWED_APP_ORIGIN)).toThrow();
  });

  it("refuses redirects and applies a bounded timeout", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response("ok");
    }) as unknown as typeof fetch;
    await guardedFetch(`${ALLOWED_APP_ORIGIN}/`, ALLOWED_APP_ORIGIN, {}, 5000, fake);
    expect(seen?.redirect).toBe("error");
    expect(seen?.signal).toBeDefined();
  });

  it("defaults to dryrun and only applies with an explicit flag", () => {
    expect(resolveRunMode([])).toBe("dryrun");
    expect(resolveRunMode(["--verbose"])).toBe("dryrun");
    expect(resolveRunMode(["--apply"])).toBe("apply");
  });
});

describe("fixtures", () => {
  it("defines exactly ten unique accounts with the required roles", () => {
    expect(ASSURANCE_02_FIXTURES).toHaveLength(10);
    expect(new Set(ASSURANCE_02_FIXTURES.map((f) => f.email)).size).toBe(10);
    expect(new Set(ASSURANCE_02_FIXTURES.map((f) => f.identifier)).size).toBe(10);
    const facultyIds = ASSURANCE_02_FIXTURES.filter((f) => f.facultyEmployeeId);
    expect(facultyIds).toHaveLength(2);
    expect(new Set(facultyIds.map((f) => f.facultyEmployeeId)).size).toBe(2);
  });

  it("never treats student_affairs as an unprivileged generic staff principal", () => {
    expect(ASSURANCE_02_FIXTURES.find((f) => f.key === "student_affairs")!.privileged).toBe(true);
    expect(KNOWN_COVERAGE_GAPS.join(" ")).toMatch(/generic unprivileged staff/);
  });
});

describe("secret vault", () => {
  it("generates an independent random password per account", () => {
    const values = Object.values(generateSecrets());
    expect(values).toHaveLength(10);
    expect(new Set(values).size).toBe(10);
    expect(new Set([generatePassword(), generatePassword()]).size).toBe(2);
  });

  it("persists exclusively with 0600 and never overwrites", () => {
    const file = join(mkdtempSync(join(tmpdir(), "a02-")), "nested", "credentials.json");
    persistSecrets(file, { studentA: "s3cret" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(() => persistSecrets(file, { studentA: "other" })).toThrow(VaultError);
    expect(JSON.parse(readFileSync(file, "utf8")).studentA).toBe("s3cret");
  });

  it("redacts passwords, JWTs and supabase keys from diagnostics", () => {
    const pwd = generatePassword();
    const msg = redactError(
      new Error(`failed with ${pwd} bearer abc.def eyJhbGciOi.eyJzdWIi.sig sb_secret_TOKENVALUE`),
      [pwd],
    );
    expect(msg).not.toContain(pwd);
    expect(msg).not.toContain("sb_secret_TOKENVALUE");
    expect(msg).toContain("[REDACTED_SECRET]");
    expect(msg).toContain("[REDACTED_TOKEN]");
  });
});

describe("durable checkpoint sink", () => {
  it("creates the JSONL file exclusively at 0600 and appends one line per event", () => {
    const dir = mkdtempSync(join(tmpdir(), "a02-sink-"));
    const path = join(dir, "priv", "checkpoints.jsonl");
    const sink = new JsonlCheckpointSink(path);
    sink.append({ key: "__run__", stage: "run-start" });
    sink.append({ key: "studentA", stage: "intent" });
    sink.close();
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).stage).toBe("intent");
    expect(() => new JsonlCheckpointSink(path)).toThrow(SinkError);
    expect(readdirSync(join(dir, "priv"))).toHaveLength(1);
  });

  it("writes intent BEFORE the action and the created ID immediately after", async () => {
    const order: string[] = [];
    const sink = new MemoryCheckpointSink((e) => order.push(`sink:${e.key}:${e.stage}`));
    const writer: WritePort = {
      async createAuthUser() {
        order.push("act:auth");
        return { userId: "uid" };
      },
      async createFacultyRecord() {
        order.push("act:faculty");
        return { facultyId: "fac" };
      },
      async createProfile() {
        order.push("act:profile");
        return { profileId: "pid" };
      },
      async createRole() {
        order.push("act:role");
        return { roleId: "role" };
      },
    };
    await provision({
      mode: "apply",
      probe: noCollisions,
      writer,
      sink,
      secrets: { studentA: "x" },
      references: okRefs,
      vaultReady: true,
      fixtures: [ASSURANCE_02_FIXTURES[0]!],
    });
    expect(order).toEqual([
      "sink:__run__:run-start",
      "sink:__run__:preflight-ok",
      "sink:studentA:intent",
      "act:auth",
      "sink:studentA:auth-created",
      "act:profile",
      "sink:studentA:profile-created",
      "act:role",
      "sink:studentA:role-created",
      "sink:__run__:run-end",
    ]);
  });

  it("stops all later writes when the durable sink fails", async () => {
    const { writer, calls } = recordingWriter();
    let n = 0;
    const sink = new MemoryCheckpointSink(() => {
      if (++n === 4) throw new SinkError("disk full"); // after first auth-created
    });
    const result = await provision({
      mode: "apply",
      probe: noCollisions,
      writer,
      sink,
      secrets: generateSecrets(),
      references: okRefs,
      vaultReady: true,
    });
    expect(result.stoppedAt?.key).toBe("studentA");
    expect(calls.filter((c) => c.startsWith("auth:"))).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("role:"))).toBe(false);
    expect(result.created[0]!.userId).toBe("uid-1"); // preserved for diagnosis
  });
});

describe("preflight and collisions", () => {
  it("performs zero write calls on a dry run", async () => {
    const { opts, calls } = baseOpts({ mode: "dryrun" });
    const result = await provision(opts);
    expect(calls).toHaveLength(0);
    expect(publicManifest(result).accounts).toHaveLength(0);
  });

  it("fails closed with zero write calls on any collision kind", async () => {
    for (const probe of [
      { ...noCollisions, authEmailExists: async (e: string) => e.includes("registrar") },
      { ...noCollisions, profileIdentifierExists: async () => true },
      { ...noCollisions, facultyEmployeeIdExists: async () => true },
      { ...noCollisions, roleMappingExists: async () => true },
    ]) {
      const { opts, calls } = baseOpts({ probe });
      await expect(provision(opts)).rejects.toBeInstanceOf(CollisionError);
      expect(calls).toHaveLength(0);
    }
  });

  it("detects a collision that only appears beyond the first page of accounts", async () => {
    const pages = [Array.from({ length: 200 }, (_, i) => `other-${i}@x.test`), [ASSURANCE_02_FIXTURES[9]!.email]];
    const known = new Set(pages.flat().map((e) => e.toLowerCase()));
    const probe: CollisionProbe = {
      ...noCollisions,
      authEmailExists: async (email) => known.has(email.toLowerCase()),
    };
    const { opts, calls } = baseOpts({ probe });
    await expect(provision(opts)).rejects.toThrow(/admin:auth_email/);
    expect(calls).toHaveLength(0);
  });

  it("refuses to write when the vault or references are not ready", async () => {
    const { opts: o1, calls: c1 } = baseOpts({ vaultReady: false });
    await expect(provision(o1)).rejects.toBeInstanceOf(PreflightError);
    expect(c1).toHaveLength(0);

    const { opts: o2, calls: c2 } = baseOpts({
      references: { verify: async () => ({ ok: false, reason: "program -> department FK mismatch" }) },
    });
    await expect(provision(o2)).rejects.toThrow(/FK mismatch/);
    expect(c2).toHaveLength(0);

    const { opts: o3, calls: c3 } = baseOpts({ secrets: {} });
    await expect(provision(o3)).rejects.toBeInstanceOf(PreflightError);
    expect(c3).toHaveLength(0);
  });

  it("never exposes an update/reset/delete path for existing accounts", () => {
    for (const file of ["run-provision.ts", "provision.ts", "run-assurance.ts"]) {
      const source = readFileSync(`tests/security/assurance-02/${file}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const forbidden of [
        "updateUserById",
        "deleteUser",
        ".upsert(",
        ".delete(",
        ".update(",
        "resetPasswordForEmail",
        "inviteUserByEmail",
        "generateLink",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});

describe("partial failure handling", () => {
  it("preserves the auth id when the following profile insert fails", async () => {
    const { writer, calls } = recordingWriter({ failProfileFor: "studentB" });
    const sink = new MemoryCheckpointSink();
    const result = await provision({
      mode: "apply",
      probe: noCollisions,
      writer,
      sink,
      secrets: generateSecrets(),
      references: okRefs,
      vaultReady: true,
    });
    expect(result.stoppedAt?.key).toBe("studentB");
    const partial = result.created.find((c) => c.key === "studentB")!;
    expect(partial.userId).toBe("uid-2");
    expect(partial.profileId).toBeUndefined();
    expect(partial.roleCreated).toBe(false);
    expect(result.incomplete).toContain("studentB");
    expect(calls.some((c) => c.startsWith("role:studentB"))).toBe(false);
    expect(sink.events().some((e) => e.stage === "failure")).toBe(true);
    expect(publicManifest(result).accounts.find((c) => c.key === "studentB")?.userId).toBe("uid-2");
  });

  it("links each new faculty profile to its own new faculty record", async () => {
    const { opts, calls } = baseOpts();
    await provision(opts);
    expect(calls).toContain("faculty:faculty_member");
    expect(calls).toContain("faculty:department_head");
    expect(calls).toContain("profile:faculty_member:uid-3:fac-faculty_member");
    expect(calls).toContain("profile:department_head:uid-4:fac-department_head");
    expect(calls.filter((c) => c.startsWith("faculty:"))).toHaveLength(2);
  });

  it("creates auth users with email_confirm and namespace metadata only", async () => {
    const seen: Record<string, unknown>[] = [];
    const writer: WritePort = {
      async createAuthUser(input) {
        seen.push(input);
        return { userId: `uid-${seen.length}` };
      },
      createFacultyRecord: async () => ({ facultyId: "fac" }),
      createProfile: async () => ({ profileId: "pid" }),
      createRole: async () => ({ roleId: "role" }),
    };
    await provision({
      mode: "apply",
      probe: noCollisions,
      writer,
      sink: new MemoryCheckpointSink(),
      secrets: generateSecrets(),
      references: okRefs,
      vaultReady: true,
    });
    expect(seen).toHaveLength(10);
    for (const call of seen) {
      expect(call.email_confirm).toBe(true);
      expect((call.user_metadata as Record<string, string>).fixture_namespace).toBe(
        "TEST_ONLY_ASSURANCE_02",
      );
    }
  });
});

describe("strict evidence classifier", () => {
  const okOwner = { status: 200, validJsonArray: true, rowCount: 1, validatedIdMatch: true };
  const pass = evaluatePositiveControl(okOwner);

  it("only accepts an owner read that returns the exact requested fixture row", () => {
    expect(pass.verdict).toBe("PASS");
    expect(pass.evidence).toEqual(okOwner);
    expect(evaluatePositiveControl({ status: 200, validJsonArray: true, rowCount: 1 }).verdict).toBe("ERROR");
    expect(evaluatePositiveControl({ status: 200, rowCount: 1 }).verdict).toBe("ERROR");
    expect(evaluatePositiveControl({ status: 200, validJsonArray: true, rowCount: 0 }).verdict).toBe("BLOCKED");
  });

  it("never treats 405, 5xx, 404, 429 or JWT errors as a successful denial", () => {
    for (const ev of [
      { status: 405 },
      { status: 500 },
      { status: 404 },
      { status: 429 },
      { status: 400 },
      { status: 200, errorCode: "PGRST301" },
      { status: 403, errorCode: "PGRST301" },
      { status: 200, errorCode: "PGRST202" },
      { status: 403, html: true },
      { status: 0, transportError: true },
    ]) {
      expect(evaluateDenial(ev, pass).verdict).toBe("ERROR");
    }
    expect(isInfrastructureFailure({ status: 405 })).toMatch(/405/);
  });

  it("requires PostgREST 42501 for a 401/403 denial and rejects unknown errors", () => {
    expect(evaluateDenial({ status: 403, errorCode: "42501" }, pass).verdict).toBe("PASS");
    expect(evaluateDenial({ status: 401, errorCode: "42501" }, pass).verdict).toBe("PASS");
    expect(evaluateDenial({ status: 403 }, pass).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 401, errorCode: "PGRST116" }, pass).verdict).toBe("ERROR");
  });

  it("requires a valid empty JSON array for a 200 denial, and a paired control", () => {
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 0 }, pass).verdict).toBe("PASS");
    expect(evaluateDenial({ status: 200, rowCount: 0 }, pass).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 0, errorCode: "PGRST116" }, pass).verdict).toBe("ERROR");
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 1 }, pass).verdict).toBe("FAIL");
    const noControl = evaluatePositiveControl({ status: 200, validJsonArray: true, rowCount: 0 });
    expect(evaluateDenial({ status: 200, validJsonArray: true, rowCount: 0 }, noControl).verdict).toBe("BLOCKED");
  });

  it("latches the abort permanently once triggered", async () => {
    const budget = new RequestBudget(10, 0);
    await budget.take();
    expect(() => budget.checkAbort({ status: 429 })).toThrow(/429/);
    expect(budget.aborted).toMatch(/429/);
    await expect(budget.take()).rejects.toThrow(/ASSURANCE_02_ABORT/);
    const b2 = new RequestBudget(1, 0);
    await b2.take();
    await expect(b2.take()).rejects.toThrow(/request cap/);
    await expect(b2.take()).rejects.toThrow(/ASSURANCE_02_ABORT/);
    const b3 = new RequestBudget(9, 0);
    b3.transportFailure();
    expect(() => b3.transportFailure()).toThrow(/two transport failures/);
    await expect(b3.take()).rejects.toThrow(/ASSURANCE_02_ABORT/);
  });
});

describe("configured fetch adapter", () => {
  const origin = ALLOWED_SUPABASE_ORIGIN;
  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("counts every actual HTTP request exactly once and rate-limits them", async () => {
    let hits = 0;
    const base = (async () => {
      hits += 1;
      return jsonRes([]);
    }) as unknown as typeof fetch;
    const net = createAssuranceFetch(origin, new RequestBudget(3, 0), base);
    await net.fetch(`${origin}/rest/v1/student_profiles`);
    await net.fetch(`${origin}/auth/v1/token`);
    expect(hits).toBe(2);
    expect(net.budget.spent).toBe(2);
    await net.fetch(`${origin}/auth/v1/logout`);
    await expect(net.fetch(`${origin}/rest/v1/x`)).rejects.toThrow(/request cap/);
    expect(hits).toBe(3);
  });

  it("refuses redirects, foreign origins and non-HTTPS", async () => {
    let seen: RequestInit | undefined;
    const base = (async (_u: string, init: RequestInit) => {
      seen = init;
      return jsonRes([]);
    }) as unknown as typeof fetch;
    const net = createAssuranceFetch(origin, new RequestBudget(10, 0), base);
    await net.fetch(`${origin}/rest/v1/a`);
    expect(seen?.redirect).toBe("error");
    expect(seen?.signal).toBeDefined();
    await expect(net.fetch("https://evil.example/x")).rejects.toThrow(/ASSURANCE_02_TARGET_REJECTED/);
    await expect(net.fetch("http://ldjhuutywqhjxabdotmn.supabase.co/x")).rejects.toThrow();
    expect(net.budget.spent).toBe(1); // rejected requests never consume budget
  });

  it("classifies HTML challenges and 5xx into the evidence and latches", async () => {
    const base = (async () =>
      new Response("<html>challenge</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const net = createAssuranceFetch(origin, new RequestBudget(10, 0), base);
    await expect(net.fetch(`${origin}/rest/v1/a`)).rejects.toThrow(/HTML challenge/);
    expect(net.last()?.html).toBe(true);
    // Catching the abort upstream must not allow another request.
    await expect(net.fetch(`${origin}/rest/v1/a`)).rejects.toThrow(/ASSURANCE_02_ABORT/);
    expect(net.budget.spent).toBe(1);

    const net5 = createAssuranceFetch(origin, new RequestBudget(10, 0), (async () =>
      jsonRes({}, 503)) as unknown as typeof fetch);
    await expect(net5.fetch(`${origin}/rest/v1/a`)).rejects.toThrow(/503/);
    expect(net5.last()?.status).toBe(503);
  });

  it("latches after two transport failures", async () => {
    const base = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const net = createAssuranceFetch(origin, new RequestBudget(10, 0), base);
    await expect(net.fetch(`${origin}/a`)).rejects.toThrow(/ECONNRESET/);
    expect(net.last()?.transportError).toBe(true);
    await expect(net.fetch(`${origin}/a`)).rejects.toThrow(/two transport failures/);
    await expect(net.fetch(`${origin}/a`)).rejects.toThrow(/ASSURANCE_02_ABORT/);
  });

  it("keeps the deadline armed through body reading (stalled body = transport failure)", async () => {
    // Headers arrive immediately; the body never completes.
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("["));
        // never closes
      },
    });
    const base = (async () =>
      new Response(stalled, {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 0), base, 150);
    const started = Date.now();
    await expect(net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/rest/v1/a`)).rejects.toThrow();
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect(net.last()?.transportError).toBe(true);
    expect(net.last()?.status).toBe(0);
  });

  it("aborts and marks a transport failure when the body exceeds the cap", async () => {
    const big = new Uint8Array(4096);
    const base = (async () =>
      new Response(big, { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 0), base, 5000, 1024);
    await expect(net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/a`)).rejects.toThrow(/ASSURANCE_02_BODY/);
    expect(net.last()?.transportError).toBe(true);
    // Second failure latches permanently; the SDK catching it cannot reopen it.
    await expect(net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/a`)).rejects.toThrow(/two transport failures/);
    await expect(net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/a`)).rejects.toThrow(/ASSURANCE_02_ABORT/);
  });

  it("handles 204/205 empty bodies and preserves status and headers", async () => {
    for (const status of [204, 205]) {
      const base = (async () =>
        new Response(null, { status, headers: { "x-marker": "kept" } })) as unknown as typeof fetch;
      const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 0), base);
      const res = await net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/auth/v1/logout`);
      expect(res.status).toBe(status);
      expect(res.headers.get("x-marker")).toBe("kept");
      expect(await res.text()).toBe("");
      expect(net.last()?.status).toBe(status);
      expect(net.budget.aborted).toBeNull();
    }
  });

  it("still delivers a readable JSON body to the SDK after buffering", async () => {
    const base = (async () =>
      new Response(JSON.stringify([{ id: "x" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 0), base);
    const res = await net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/rest/v1/a`);
    expect(await res.json()).toEqual([{ id: "x" }]);
  });
});


describe("runner identity mapping and manifest preflight", () => {
  const fullManifest = () => ({
    namespace: "TEST_ONLY_ASSURANCE_02",
    mode: "apply",
    accounts: ASSURANCE_02_FIXTURES.map((f, i) => ({
      key: f.key,
      userId: `00000000-0000-4000-8000-0000000000${(10 + i).toString().padStart(2, "0")}`,
      profileId: `00000000-0000-4000-8000-0000000001${(10 + i).toString().padStart(2, "0")}`,
      roleCreated: true,
    })),
  });
  const keys = ASSURANCE_02_FIXTURES.map((f) => f.key);

  it("uses the fixture table as the single identity mapping (no re-derivation)", () => {
    const runner = readFileSync("tests/security/assurance-02/run-assurance.ts", "utf8");
    expect(runner).not.toContain("deriveEmail");
    expect(runner).toContain("ASSURANCE_02_FIXTURES");
    expect(ASSURANCE_02_FIXTURES.find((f) => f.key === "faculty_member")!.email).toBe(
      "a02-faculty@assurance02.test.invalid",
    );
  });

  it("accepts a complete manifest and rejects every incomplete variant", () => {
    expect(preflightManifest(fullManifest(), keys)).toHaveLength(10);
    const bad = [
      { ...fullManifest(), namespace: "OTHER" },
      { ...fullManifest(), mode: "dryrun" },
      { ...fullManifest(), accounts: fullManifest().accounts.slice(0, 9) },
      {
        ...fullManifest(),
        accounts: fullManifest().accounts.map((a, i) => (i === 3 ? { ...a, roleCreated: false } : a)),
      },
      {
        ...fullManifest(),
        accounts: fullManifest().accounts.map((a, i) => (i === 2 ? { ...a, userId: "not-a-uuid" } : a)),
      },
      {
        ...fullManifest(),
        accounts: fullManifest().accounts.map((a, i) => (i === 5 ? { ...a, profileId: null } : a)),
      },
    ];
    for (const manifest of bad) {
      expect(() => preflightManifest(manifest as never, keys)).toThrow(/ASSURANCE_02_BLOCKED/);
    }
    expect(() => preflightManifest(fullManifest(), keys.slice(0, 9))).toThrow(/private vault/);
  });

  it("final aggregation: coverageBlocked alone forces HOLD, failures win", () => {
    const ev = { status: 200 };
    const pass = { a: { verdict: "PASS" as const, reason: "", evidence: ev } };

    // Clean results but non-empty coverage list => HOLD, never a silent 0.
    expect(finalOutcome({ results: pass, coverageBlocked: [] })).toEqual({ code: 0, outcome: "PASS" });
    expect(finalOutcome({ results: pass, coverageBlocked: ["docs missing"] })).toEqual({
      code: 4,
      outcome: "HOLD",
    });
    // A BLOCKED verdict also holds.
    expect(
      finalOutcome({
        results: { ...pass, b: { verdict: "BLOCKED", reason: "", evidence: ev } },
        coverageBlocked: [],
      }).code,
    ).toBe(4);
    // FAIL / ERROR / latched abort / sign-out failure all take precedence.
    expect(finalOutcome({ results: { a: { verdict: "ERROR", reason: "", evidence: ev } }, coverageBlocked: ["x"] })).toEqual(
      { code: 1, outcome: "FAIL" },
    );
    expect(finalOutcome({ results: { a: { verdict: "FAIL", reason: "", evidence: ev } }, coverageBlocked: [] }).code).toBe(1);
    expect(finalOutcome({ results: pass, coverageBlocked: [], abortLatched: "HTTP 429" }).code).toBe(1);
    expect(finalOutcome({ results: pass, coverageBlocked: [], signOutFailures: 1 }).code).toBe(1);
    // A failed login is an ERROR verdict, so it can never exit 0.
    expect(
      finalOutcome({
        results: { "login:studentA": { verdict: "ERROR", reason: "no session", evidence: ev } },
        coverageBlocked: [],
      }).code,
    ).toBe(1);
  });


  it("retains only non-PII evidence and validates the returned row identity", async () => {
    const id = "00000000-0000-4000-8000-000000000199";
    const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 0), (async () =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch);
    const fakeOwner = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [{ id }], error: null, status: 200 }) }) }),
    };
    const ownerEv = await readProfileById(fakeOwner as never, id, net);
    expect(ownerEv).toEqual({
      status: 200,
      html: false,
      errorCode: null,
      validJsonArray: true,
      rowCount: 1,
      validatedIdMatch: true,
      durationMs: ownerEv.durationMs,
      pacedElapsedMs: ownerEv.pacedElapsedMs,
    });
    expect(evaluatePositiveControl(ownerEv).verdict).toBe("PASS");


    const wrongRow = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [{ id: "other" }], error: null, status: 200 }) }),
      }),
    };
    expect(evaluatePositiveControl(await readProfileById(wrongRow as never, id, net)).verdict).toBe("ERROR");

    const denied = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: null, error: { code: "42501" }, status: 403 }),
        }),
      }),
    };
    const denialEv = await readProfileById(denied as never, id, net);
    expect(denialEv.validJsonArray).toBe(false);
    expect(evaluateDenial(denialEv, evaluatePositiveControl(ownerEv)).verdict).toBe("PASS");
  });

  it("keeps the imposed pacing wait out of the adapter-measured HTTP time", async () => {
    const id = "00000000-0000-4000-8000-000000000200";
    const slowFetch = (async () => {
      await new Promise((r) => setTimeout(r, 60));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    // 400ms minimum interval stands in for the live <=1 req/sec pacing.
    const net = createAssuranceFetch(ALLOWED_SUPABASE_ORIGIN, new RequestBudget(10, 400), slowFetch);
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => {
            await net.fetch(`${ALLOWED_SUPABASE_ORIGIN}/rest/v1/student_profiles`);
            return { data: [{ id }], error: null, status: 200 };
          },
        }),
      }),
    };
    await readProfileById(client as never, id, net); // consumes the free first slot
    const paced = await readProfileById(client as never, id, net);
    expect(paced.durationMs!).toBeGreaterThanOrEqual(55);
    expect(paced.durationMs!).toBeLessThan(300);
    // The pacing wait must show up in pacedElapsedMs and nowhere else.
    expect(paced.pacedElapsedMs!).toBeGreaterThanOrEqual(330);
    expect(paced.pacedElapsedMs! - paced.durationMs!).toBeGreaterThanOrEqual(250);
  });
});

