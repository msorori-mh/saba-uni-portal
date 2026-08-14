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
});
