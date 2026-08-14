/**
 * Trust-enrollment server authority contract.
 *
 * Proves that device registration and step-up challenge issuance are performed
 * by the server (fresh re-authentication + server-built payload hash), and that
 * no client-supplied hash, nonce or expiry can enter the challenge.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hashStepUpPayload } from "../../src/lib/security/step-up-contract";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const serverSource = read("src/lib/security/device-trust.functions.ts");
const migration = read("docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql");

describe("SERVER_REAUTH_DEVICE_REGISTRATION", () => {
  test("registration requires fresh password re-authentication before any write", () => {
    const reauthAt = serverSource.indexOf("REAUTHENTICATION_FAILED");
    const writeAt = serverSource.indexOf('from("student_trusted_devices").upsert');
    expect(reauthAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(reauthAt).toBeLessThan(writeAt);
    expect(serverSource).toContain("signInWithPassword");
  });

  test("registration runs behind authenticated middleware with a strict input schema", () => {
    expect(serverSource).toContain(".middleware([requireSupabaseAuth])");
    expect(serverSource).toContain("registerDeviceSchema");
    expect(serverSource).toContain(".strict()");
  });

  test("the client never calls the registration RPC directly", () => {
    const client = read("src/lib/security/device-trust-client.ts");
    expect(client).not.toContain("register_student_device");
    expect(client).not.toContain("issue_step_up_challenge");
  });
});

describe("SERVER_AUTHORITATIVE_CHALLENGE", () => {
  test("challenge input accepts only requestId and deviceId", () => {
    const schema = serverSource.slice(
      serverSource.indexOf("const beginChallengeSchema"),
      serverSource.indexOf("export type StepUpChallenge"),
    );
    expect(schema).toContain("requestId");
    expect(schema).toContain("deviceId");
    expect(schema).not.toContain("payloadHash");
    expect(schema).not.toContain("nonce");
    expect(schema).not.toContain("expiresAt");
    expect(schema).toContain(".strict()");
  });

  test("nonce, expiry and payload hash are built on the server", () => {
    const handler = serverSource.slice(
      serverSource.indexOf("export const beginStepUpChallengeFn"),
      serverSource.indexOf("async function currentStudentProfileId"),
    );
    expect(handler).toContain("crypto.getRandomValues");
    expect(handler).toContain("Date.now() + 120_000");
    expect(handler).toContain("await hashStepUpPayload(");
    expect(handler).toContain("DEVICE_NOT_TRUSTED");
    expect(handler).toContain("isStepUpSensitiveService");
  });

  test("payload hashing is deterministic and binds request, code and attachments", async () => {
    const base = {
      requestId: "11111111-1111-1111-1111-111111111111",
      canonicalCode: "file_withdrawal",
      formData: { reason: "test" },
      attachmentIds: ["a", "b"],
    };
    const h1 = await hashStepUpPayload(base);
    const h2 = await hashStepUpPayload({ ...base });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashStepUpPayload({ ...base, canonicalCode: "final_chance" })).not.toBe(h1);
    expect(await hashStepUpPayload({ ...base, attachmentIds: ["a"] })).not.toBe(h1);
    expect(await hashStepUpPayload({ ...base, formData: { reason: "other" } })).not.toBe(h1);
  });
});

describe("migration grant contract", () => {
  test("trust-enrollment RPCs are revoked from client roles and granted to service_role", () => {
    for (const sig of [
      "public.register_student_device(text, text, text, text)",
      "public.issue_step_up_challenge(text, text, uuid, text)",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION ${sig}\n  FROM PUBLIC, anon, authenticated;`,
      );
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${sig}\n  TO service_role;`);
    }
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.register_student_device(text, text, text, text) TO authenticated",
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.issue_step_up_challenge(text, text, uuid, text) TO authenticated",
    );
  });

  test("device revocation stays granted to authenticated", () => {
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.revoke_student_device(text) TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.revoke_all_student_devices() TO authenticated;",
    );
  });
});
