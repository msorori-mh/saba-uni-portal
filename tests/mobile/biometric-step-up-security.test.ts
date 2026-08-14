import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STEP_UP_SENSITIVE_SERVICES,
  buildStepUpSigningMessage,
  canonicalizeStepUpPayload,
  getStepUpDescriptor,
  hashStepUpPayload,
  isStepUpSensitiveService,
} from "../../src/lib/security/step-up-contract";
import { performStepUp, type StepUpRpcClient } from "../../src/lib/security/step-up-client";
import { BiometricError } from "../../src/lib/native/biometrics";
import { derToRawEcdsaSignature } from "../../src/lib/security/ecdsa-der";
import {
  isContentVisible,
  nextAppLockState,
  shouldApplySecureScreen,
} from "../../src/lib/security/app-lock-contract";

const ROOT = join(import.meta.dir, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("step-up contract", () => {
  test("covers exactly the five approved sensitive services", () => {
    expect([...STEP_UP_SENSITIVE_SERVICES].sort()).toEqual([
      "department_transfer",
      "enrollment_suspension",
      "excused_absence",
      "file_withdrawal",
      "final_chance",
    ]);
    for (const code of STEP_UP_SENSITIVE_SERVICES) {
      expect(isStepUpSensitiveService(code)).toBe(true);
      expect(getStepUpDescriptor(code)?.consequencesAr.length).toBeGreaterThan(0);
    }
    expect(isStepUpSensitiveService("enrollment_certificate")).toBe(false);
  });

  test("payload canonicalization is order independent but value sensitive", async () => {
    const a = canonicalizeStepUpPayload({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalizeStepUpPayload({ a: { x: 1, y: 2 }, b: 1 });
    expect(a).toBe(b);
    const h1 = await hashStepUpPayload({ department: "A" });
    const h2 = await hashStepUpPayload({ department: "B" });
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("signing message binds user, device, action, request and payload hash", () => {
    const message = buildStepUpSigningMessage({
      challengeId: "c",
      nonce: "n",
      userId: "u",
      deviceId: "d",
      actionCode: "submit_file_withdrawal",
      requestId: "r",
      payloadHash: "h",
      expiresAt: "2026-01-01T00:00:00Z",
    });
    for (const part of ["c", "n", "u", "d", "submit_file_withdrawal", "r", "h"]) {
      expect(message.split("|")).toContain(part);
    }
  });
});

function makeClient(calls: string[]): StepUpRpcClient {
  return {
    rpc: async (fn) => {
      calls.push(fn);
      if (fn === "issue_step_up_challenge") {
        return {
          data: {
            challenge_id: "11111111-1111-1111-1111-111111111111",
            nonce: "abc",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            device_id: "dev",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
}

const baseInput = {
  serviceCode: "file_withdrawal",
  requestId: "22222222-2222-2222-2222-222222222222",
  userId: "33333333-3333-3333-3333-333333333333",
  payload: { a: 1 },
};

describe("step-up orchestration", () => {
  test("cancel yields no proof and no verification call", async () => {
    const calls: string[] = [];
    let verified = 0;
    const outcome = await performStepUp(makeClient(calls), baseInput, {
      biometricsAvailable: () => true,
      ensureKey: async () => ({ deviceId: "dev", publicKeyDer: "k", algorithm: "SHA256withECDSA" }),
      sign: async () => {
        throw new BiometricError("USER_CANCELED");
      },
      verifyAssertion: async () => {
        verified += 1;
        return { ok: true, proofToken: "nope" };
      },
    });
    expect(outcome.status).toBe("canceled");
    expect(verified).toBe(0);
    expect(calls).toEqual(["issue_step_up_challenge"]);
  });

  test("device key invalidation revokes trust", async () => {
    const outcome = await performStepUp(makeClient([]), baseInput, {
      biometricsAvailable: () => true,
      ensureKey: async () => {
        throw new BiometricError("KEY_INVALIDATED");
      },
      verifyAssertion: async () => ({ ok: true, proofToken: "x" }),
    });
    expect(outcome.status).toBe("trust_revoked");
  });

  test("unavailable biometrics never issues a challenge", async () => {
    const calls: string[] = [];
    const outcome = await performStepUp(makeClient(calls), baseInput, {
      biometricsAvailable: () => false,
    });
    expect(outcome.status).toBe("unavailable");
    expect(calls).toEqual([]);
  });

  test("successful signature exchanges for exactly one server proof", async () => {
    const calls: string[] = [];
    let verified = 0;
    const outcome = await performStepUp(makeClient(calls), baseInput, {
      biometricsAvailable: () => true,
      ensureKey: async () => ({ deviceId: "dev", publicKeyDer: "k", algorithm: "SHA256withECDSA" }),
      sign: async () => ({ signature: "sig", algorithm: "SHA256withECDSA" }),
      verifyAssertion: async () => {
        verified += 1;
        return { ok: true, proofToken: "proof-token" };
      },
    });
    expect(outcome).toEqual({ status: "proof", proofToken: "proof-token" });
    expect(verified).toBe(1);
  });

  test("server rejection produces failure, not a proof", async () => {
    const outcome = await performStepUp(makeClient([]), baseInput, {
      biometricsAvailable: () => true,
      ensureKey: async () => ({ deviceId: "dev", publicKeyDer: "k", algorithm: "SHA256withECDSA" }),
      sign: async () => ({ signature: "sig", algorithm: "SHA256withECDSA" }),
      verifyAssertion: async () => ({ ok: false }),
    });
    expect(outcome.status).toBe("failed");
  });
});

describe("app lock state machine", () => {
  test("background then resume requires biometric re-auth", () => {
    let state = nextAppLockState("unlocked", { type: "BACKGROUND" }, true);
    expect(state).toBe("covered");
    expect(isContentVisible(state)).toBe(false);
    expect(shouldApplySecureScreen(state)).toBe(true);

    state = nextAppLockState(state, { type: "FOREGROUND" }, true);
    expect(state).toBe("locked");
    expect(isContentVisible(state)).toBe(false);

    state = nextAppLockState(state, { type: "UNLOCK_FAILURE" }, true);
    expect(state).toBe("locked");
    expect(isContentVisible(state)).toBe(false);

    state = nextAppLockState(state, { type: "UNLOCK_SUCCESS" }, true);
    expect(state).toBe("unlocked");
    expect(isContentVisible(state)).toBe(true);
    expect(shouldApplySecureScreen(state)).toBe(false);
  });

  test("lock disabled keeps the current behaviour", () => {
    let state = nextAppLockState("unlocked", { type: "BACKGROUND" }, false);
    state = nextAppLockState(state, { type: "FOREGROUND" }, false);
    expect(state).toBe("unlocked");
  });

  test("device trust revocation clears the lock and forces re-enrolment", () => {
    expect(nextAppLockState("locked", { type: "TRUST_REVOKED" }, true)).toBe("unlocked");
  });
});

describe("ecdsa der decoding", () => {
  test("rejects malformed DER", () => {
    expect(derToRawEcdsaSignature(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  test("decodes a well-formed P-256 DER signature to 64 raw bytes", () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw?.length).toBe(64);
    expect(Array.from(raw!.slice(0, 32))).toEqual(Array.from(r));
  });
});

describe("no biometric material leaves the device", () => {
  const sources = [
    "src/lib/native/biometrics.ts",
    "src/lib/security/step-up-client.ts",
    "src/lib/security/step-up-contract.ts",
    "src/lib/security/device-trust-client.ts",
    "src/lib/security/step-up-verify.functions.ts",
    "docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql",
  ];

  test("no template/fingerprint payload is persisted, logged or transmitted", () => {
    for (const rel of sources) {
      const text = read(rel);
      expect(text).not.toMatch(/fingerprint_(template|image|data)/i);
      expect(text).not.toMatch(/biometric_(template|image|sample|score)/i);
      expect(text).not.toMatch(/console\.log\(/);
    }
  });

  test("proof minting is service_role only and the submit consumes it atomically", () => {
    const sql = read("docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.mint_step_up_proof(uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mint_step_up_proof(uuid) TO service_role;");
    expect(sql).toContain("PERFORM public.consume_step_up_proof(");
    expect(sql).toContain("consumed_at IS NULL");
    expect(sql).toContain("STEP_UP_DEVICE_REVOKED");
  });

  test("android keystore key is biometric-bound and invalidated on enrolment change", () => {
    const java = read("android/app/src/main/java/ye/edu/usr/fitcs/portal/BiometricKeystorePlugin.java");
    expect(java).toContain("setUserAuthenticationRequired(true)");
    expect(java).toContain("setInvalidatedByBiometricEnrollment(true)");
    expect(java).toContain("FLAG_SECURE");
    expect(java).not.toMatch(/getPrivate\(\)\.getEncoded/);
  });

  test("submit flow requires the proof before calling the submit RPC", () => {
    const form = read("src/components/student-requests/b1/B1StudentRequestForm.tsx");
    expect(form).toContain("isStepUpSensitiveService");
    expect(form).toContain('if (outcome.status !== "proof")');
    expect(form).toContain("await submit(outcome.proofToken)");
  });
});
