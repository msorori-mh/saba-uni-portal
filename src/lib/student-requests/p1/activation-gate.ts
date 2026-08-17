/**
 * P1 — production activation gate.
 * A P1 service may only be flipped to student_visible=true when every readiness
 * dimension passes. Source never flips visibility by itself.
 */

import type { P1ServiceCode } from "./authorization-matrix";

export const P1_READINESS_DIMENSIONS = [
  "TYPE_CONFIG",
  "FORM",
  "DETAIL_MODEL",
  "VALIDATION",
  "WORKFLOW",
  "AUTHZ_MATRIX",
  "NOTIFICATION",
  "E2E",
] as const;

export type P1ReadinessDimension = (typeof P1_READINESS_DIMENSIONS)[number];
export type P1Readiness = Record<P1ReadinessDimension, "PASS" | "PENDING" | "FAIL">;

/**
 * Source-level readiness for P1.
 * DETAIL_MODEL and VALIDATION are closed in source: the canonical detail tables,
 * the authoritative server-side recomputation, the workflow seeds and the
 * replacement of the legacy grade redistribution all ship as forward-only
 * migration drafts rehearsed on PostgreSQL 17
 * (scripts/p1-source-closure-02-pg17). E2E is PASS for the three completed P1
 * services after the production TEST_ONLY end-to-end runs (08C) and the
 * read-only attestation (09A). department_transfer stays PENDING.
 */
export const P1_SOURCE_READINESS: Readonly<Record<P1ServiceCode, P1Readiness>> = {
  october_exam_entry_form: base({}),
  replacement_student_card: base({}),
  grade_appeal: base({}),
  department_transfer: base({ E2E: "PENDING" }),
};

function base(overrides: Partial<P1Readiness>): P1Readiness {
  const all = Object.fromEntries(
    P1_READINESS_DIMENSIONS.map((d) => [d, "PASS"]),
  ) as P1Readiness;
  return { ...all, ...overrides };
}

export function canActivateP1Service(readiness: P1Readiness): boolean {
  return P1_READINESS_DIMENSIONS.every((d) => readiness[d] === "PASS");
}

export function isP1ServiceProductionActivatable(service: P1ServiceCode): boolean {
  return canActivateP1Service(P1_SOURCE_READINESS[service]);
}
