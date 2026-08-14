import { beforeAll, describe, expect, test } from "bun:test";

import {
  runDirectRpcBypassMatrix,
  type BypassMatrix,
} from "../../scripts/step-up-direct-rpc-bypass/harness";

let matrix: BypassMatrix;

beforeAll(async () => {
  matrix = await runDirectRpcBypassMatrix();
}, 180_000);

const denied = (name: string, needle: string) => {
  const outcome = matrix.cases[name]!;
  expect(outcome.ok).toBe(false);
  expect(outcome.error ?? "").toContain(needle);
};

describe("step-up direct RPC bypass matrix (post-migration, real Postgres)", () => {
  test("5_ARG_SENSITIVE_DIRECT_RPC = DENY", () => {
    denied("5_ARG_SENSITIVE_DIRECT_RPC", "STEP_UP_PROOF_REQUIRED");
  });

  test("legacy core implementation is not reachable by authenticated", () => {
    denied("5_ARG_CORE_DIRECT_RPC", "permission denied");
  });

  test("7_ARG_WITHOUT_PROOF = DENY", () => {
    denied("7_ARG_WITHOUT_PROOF", "STEP_UP_PROOF_REQUIRED");
  });

  test("7_ARG_VALID_PROOF = PASS", () => {
    expect(matrix.cases["7_ARG_VALID_PROOF"]).toEqual({ ok: true });
  });

  test("REPLAY = DENY", () => {
    denied("REPLAY", "STEP_UP_PROOF_INVALID");
  });

  test("a proof consumed in an earlier transaction cannot unlock the 5-arg path", () => {
    denied("5_ARG_AFTER_CONSUMED_PROOF", "STEP_UP_PROOF_REQUIRED");
  });

  test("payload tampering invalidates the proof", () => {
    denied("PAYLOAD_TAMPER", "STEP_UP_PROOF_INVALID");
  });

  test("proof minting and consumption are not client-callable", () => {
    denied("MINT_DIRECT_BY_AUTHENTICATED", "permission denied");
    denied("CONSUME_DIRECT_BY_AUTHENTICATED", "permission denied");
  });

  test("non-sensitive legacy 5-arg behaviour is preserved", () => {
    expect(matrix.cases["NON_SENSITIVE_LEGACY_5_ARG"]).toEqual({ ok: true });
  });
});

describe("trust enrollment is server-authoritative", () => {
  test("AUTHENTICATED_REGISTER_DEVICE_DIRECT = DENY", () => {
    denied("AUTHENTICATED_REGISTER_DEVICE_DIRECT", "permission denied");
  });

  test("AUTHENTICATED_ISSUE_CHALLENGE_DIRECT = DENY", () => {
    denied("AUTHENTICATED_ISSUE_CHALLENGE_DIRECT", "permission denied");
  });

  test("device revocation stays callable by the signed-in student", () => {
    expect(matrix.cases["AUTHENTICATED_REVOKE_DEVICE_DIRECT"]).toEqual({ ok: true });
    expect(matrix.cases["AUTHENTICATED_REVOKE_ALL_DEVICES_DIRECT"]).toEqual({ ok: true });
  });
});

describe("post-migration proacl", () => {
  test("execute privileges match the intended contract", () => {
    expect(matrix.privileges).toMatchObject({
      authenticated_5arg: true, // guarded wrapper, sensitive codes denied inside
      authenticated_core: false, // private implementation
      authenticated_7arg: true,
      authenticated_consume: false,
      authenticated_mint: false,
      anon_5arg: false,
      anon_7arg: false,
      // trust enrollment: service_role only
      public_register_device: false,
      public_issue_challenge: false,
      anon_register_device: false,
      anon_issue_challenge: false,
      authenticated_register_device: false,
      authenticated_issue_challenge: false,
      service_role_register_device: true,
      service_role_issue_challenge: true,
      // device revocation remains user-callable
      authenticated_revoke_device: true,
      authenticated_revoke_all_devices: true,
    });
  });

  test("proacl is captured for every submit/step-up signature", () => {
    const signatures = Object.keys(matrix.proacl);
    expect(
      signatures.some((s) =>
        s.startsWith("submit_b1_student_request_atomic_core(") ? true : false,
      ),
    ).toBe(true);
    expect(
      signatures.filter((s) => s.startsWith("submit_b1_student_request_atomic(")).length,
    ).toBe(2);
    for (const [sig, acl] of Object.entries(matrix.proacl)) {
      if (sig.startsWith("submit_b1_student_request_atomic_core(")) {
        expect(acl).not.toContain("authenticated=X");
      }
      expect(acl).not.toContain("anon=X");
    }
  });

  test("trust enrollment proacl grants execute to service_role only", () => {
    for (const name of ["register_student_device(", "issue_step_up_challenge("]) {
      const entry = Object.entries(matrix.proacl).find(([sig]) => sig.startsWith(name));
      expect(entry).toBeDefined();
      const acl = entry![1];
      expect(acl).not.toContain("authenticated=X");
      expect(acl).not.toContain("anon=X");
      expect(acl).not.toMatch(/(^|\| )=X/); // no PUBLIC execute
      expect(acl).toContain("service_role=X");
    }
  });
});
