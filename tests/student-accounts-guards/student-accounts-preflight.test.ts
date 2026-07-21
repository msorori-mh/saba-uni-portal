/**
 * STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01 (track D)
 *
 * Run: bun test tests/student-accounts-guards/
 *
 * Pure-function tests: the DB/Auth boundary is dependency-injected readers
 * (plain async functions here) — nothing is mocked to fake a missing data
 * source; every scenario provides its production facts explicitly.
 *
 * PII policy: all fixtures are synthetic (academic numbers F9999xxx, emails
 * derived from them on the synthetic students domain). No real names,
 * emails, phones, auth IDs, or user IDs appear anywhere.
 */
import { describe, expect, it } from "bun:test";
import {
  STUDENT_ACCOUNTS_PREFLIGHT_CODES,
  buildStudentAccountsProductionSnapshot,
  classifyStudentAccountsPreflightRows,
  computeStudentAccountsFileHash,
  countStudentAccountsDuplicates,
  evaluateStudentAccountsGate,
  isStudentAccountsSnapshotExpired,
  runStudentAccountsPreflight,
  runStudentAccountsPreflightClassification,
  verifyStudentAccountsSnapshotHash,
  type StudentAccountsGateContext,
  type StudentAccountsPreflightProfileRecord,
  type StudentAccountsPreflightReaders,
  type StudentAccountsProductionSnapshot,
} from "../../src/lib/imports/student-accounts-preflight";

/* ---------------- synthetic fixtures (NO PII) ---------------- */

const AC = (i: number) => `F999${String(i).padStart(4, "0")}`; // F9999001..
const EMAIL = (i: number) => `${AC(i).toLowerCase()}@students.usr.edu.ye`;
const REF = "test-project-ref";

function row(i: number, overrides: Record<string, unknown> = {}) {
  return {
    academic_number: AC(i),
    university_email: EMAIL(i),
    must_change_password: true,
    is_active: true,
    notes: "",
    ...overrides,
  };
}

function rows(range: number[]): Record<string, unknown>[] {
  return range.map((i) => row(i));
}

function seq(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

function makeReaders(opts: {
  linked?: number[];
  unlinked?: number[];
  authExisting?: number[];
  profileEmailOverride?: Record<number, string>;
  extraRecords?: StudentAccountsPreflightProfileRecord[];
}): StudentAccountsPreflightReaders {
  const records: StudentAccountsPreflightProfileRecord[] = [];
  for (const i of opts.linked ?? []) {
    records.push({
      academic_number: AC(i),
      email: opts.profileEmailOverride?.[i] ?? EMAIL(i),
      user_linked: true,
    });
  }
  for (const i of opts.unlinked ?? []) {
    records.push({ academic_number: AC(i), email: null, user_linked: false });
  }
  records.push(...(opts.extraRecords ?? []));
  const authSet = new Set((opts.authExisting ?? []).map((i) => EMAIL(i)));
  return {
    fetchProfileRecords: async () => records,
    findAuthExistingEmails: async (emails) => emails.filter((e) => authSet.has(e)),
  };
}

function makeSnapshot(
  overrides: {
    total?: number;
    linked?: number;
    captured_at?: string;
    expires_at?: string;
    project_ref?: string;
  } = {},
): StudentAccountsProductionSnapshot {
  const now = Date.now();
  return buildStudentAccountsProductionSnapshot({
    total_profiles: overrides.total ?? 846,
    linked_profiles: overrides.linked ?? 843,
    captured_at: overrides.captured_at ?? new Date(now - 60_000).toISOString(),
    expires_at: overrides.expires_at ?? new Date(now + 10 * 60_000).toISOString(),
    source_channel: "supabase_service_role_readonly",
    project_ref: overrides.project_ref ?? REF,
  });
}

function makeGate(
  rawRows: Record<string, unknown>[],
  snapshot: StudentAccountsProductionSnapshot,
  overrides: Partial<StudentAccountsGateContext> = {},
): StudentAccountsGateContext {
  const hash = computeStudentAccountsFileHash(rawRows);
  return {
    snapshot,
    now: new Date().toISOString(),
    expected_project_ref: REF,
    preview_file_hash: hash,
    execute_file_hash: hash,
    dry_run_completed: true,
    actor_role: "admin",
    importer_source_sha_proven: true,
    deploy_proof_proven: true,
    ...overrides,
  };
}

/* ---------------- contract ---------------- */

describe("classification code contract", () => {
  it("exposes exactly the 12 contracted codes", () => {
    expect(STUDENT_ACCOUNTS_PREFLIGHT_CODES.length).toBe(12);
    expect([...STUDENT_ACCOUNTS_PREFLIGHT_CODES].sort()).toEqual(
      [
        "ALREADY_LINKED",
        "CONFLICT",
        "DUPLICATE_ACADEMIC_NUMBER",
        "DUPLICATE_EMAIL",
        "DUPLICATE_IN_FILE",
        "FILE_CHANGED_AFTER_PREVIEW",
        "INVALID_EMAIL",
        "READY_TO_CREATE",
        "SNAPSHOT_MISMATCH",
        "STALE_SNAPSHOT",
        "STUDENT_NOT_FOUND",
        "UNAUTHORIZED",
      ].sort(),
    );
  });
});

/* ---------------- production reality (D-02: 846 total / 843 linked / 3 unlinked) ---------------- */

describe("binding rule vs production reality", () => {
  it("MANDATORY: file_rows=566 with production_unlinked=3 and no READY rows ⇒ HOLD", async () => {
    const file = rows(seq(1, 566));
    // All 566 file students are already linked in production; the 3 unlinked
    // production profiles are NOT in this file ⇒ nothing may be created and
    // the binding rule (READY == unlinked) fails closed.
    const readers = makeReaders({ linked: seq(1, 566) });
    const snapshot = makeSnapshot({ total: 846, linked: 843 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.file_rows).toBe(566);
    expect(report.summary.ALREADY_LINKED).toBe(566);
    expect(report.summary.READY_TO_CREATE).toBe(0);
    expect(snapshot.unlinked_profiles).toBe(3);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("BINDING_RULE_VIOLATION");
    expect(report.decision.binding_rule).toEqual({
      ready_to_create: 0,
      snapshot_unlinked_profiles: 3,
      satisfied: false,
    });
  });

  it("binding rule UPPER bound: READY_TO_CREATE (2) > snapshot.unlinked (1) ⇒ HOLD", async () => {
    // Drift in the other direction: the file would create MORE accounts than
    // production has unlinked profiles ⇒ fail closed, never create extras.
    const file = rows([1, 2]);
    const readers = makeReaders({ unlinked: [1, 2] });
    const snapshot = makeSnapshot({ total: 3, linked: 2 }); // unlinked=1
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.READY_TO_CREATE).toBe(2);
    expect(snapshot.unlinked_profiles).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("BINDING_RULE_VIOLATION");
    expect(report.decision.binding_rule).toEqual({
      ready_to_create: 2,
      snapshot_unlinked_profiles: 1,
      satisfied: false,
    });
  });

  it("GO-eligible: 563 ALREADY_LINKED + 3 READY_TO_CREATE matching unlinked=3", async () => {
    const file = rows(seq(1, 566));
    const readers = makeReaders({ linked: seq(1, 563), unlinked: seq(564, 566) });
    const snapshot = makeSnapshot({ total: 846, linked: 843 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.ALREADY_LINKED).toBe(563);
    expect(report.summary.READY_TO_CREATE).toBe(3);
    expect(report.decision.decision).toBe("GO");
    expect(report.decision.hold_reasons).toEqual([]);
    expect(report.decision.binding_rule.satisfied).toBe(true);
  });
});

/* ---------------- blocking conditions ---------------- */

describe("blocking conditions", () => {
  it("one conflict (orphan auth account for an unlinked email) ⇒ HOLD", async () => {
    const file = rows(seq(1, 11));
    const readers = makeReaders({
      linked: seq(1, 10),
      unlinked: [11],
      authExisting: [11],
    });
    const snapshot = makeSnapshot({ total: 11, linked: 10 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.CONFLICT).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("CONFLICTS_PRESENT");
  });

  it("conflict: email owned by a different student profile ⇒ HOLD", async () => {
    const file = [row(2)];
    const readers = makeReaders({
      unlinked: [2],
      extraRecords: [
        { academic_number: AC(1), email: EMAIL(2), user_linked: true },
      ],
    });
    const { summary } = await runStudentAccountsPreflightClassification(
      file,
      readers,
    );
    expect(summary.CONFLICT).toBe(1);
  });

  it("duplicate email in file ⇒ DUPLICATE_EMAIL + HOLD", async () => {
    const file = [row(1), row(2), row(3, { university_email: EMAIL(2) })];
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({ total: 3, linked: 0 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.DUPLICATE_EMAIL).toBe(1);
    expect(countStudentAccountsDuplicates(report.summary)).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("DUPLICATES_PRESENT");
  });

  it("duplicate academic number in file ⇒ DUPLICATE_ACADEMIC_NUMBER + HOLD", async () => {
    const file = [row(1), row(2, { academic_number: AC(1) })];
    const readers = makeReaders({ unlinked: [1, 2] });
    const snapshot = makeSnapshot({ total: 2, linked: 0 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.DUPLICATE_ACADEMIC_NUMBER).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("DUPLICATES_PRESENT");
  });

  it("exact duplicate row in file ⇒ DUPLICATE_IN_FILE", () => {
    const file = [row(1), row(1)];
    const classified = classifyStudentAccountsPreflightRows(
      file,
      [{ academic_number: AC(1), email: null, user_linked: false }],
      new Set(),
    );
    expect(classified[0]?.code).toBe("READY_TO_CREATE");
    expect(classified[1]?.code).toBe("DUPLICATE_IN_FILE");
  });

  it("stale snapshot (expired) ⇒ HOLD with STALE_SNAPSHOT", async () => {
    const file = rows(seq(1, 3));
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({
      total: 3,
      linked: 0,
      captured_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const gate = makeGate(file, snapshot);
    const report = await runStudentAccountsPreflight(file, readers, gate);
    expect(isStudentAccountsSnapshotExpired(snapshot, gate.now)).toBe(true);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("STALE_SNAPSHOT");
    expect(report.decision.batch_flags).toContain("STALE_SNAPSHOT");
  });

  it("file changed after preview (hash mismatch) ⇒ HOLD with FILE_CHANGED_AFTER_PREVIEW", async () => {
    const file = rows(seq(1, 3));
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({ total: 3, linked: 0 });
    const changedHash = computeStudentAccountsFileHash([
      ...file,
      row(4), // file gained a row after the preview/dry-run
    ]);
    const gate = makeGate(file, snapshot, { execute_file_hash: changedHash });
    const report = await runStudentAccountsPreflight(file, readers, gate);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("FILE_CHANGED_AFTER_PREVIEW");
    expect(report.decision.batch_flags).toContain("FILE_CHANGED_AFTER_PREVIEW");
  });

  it("direct execute without dry-run ⇒ HOLD with DRY_RUN_MISSING", async () => {
    const file = rows(seq(1, 3));
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({ total: 3, linked: 0 });
    const gate = makeGate(file, snapshot, { dry_run_completed: false });
    const report = await runStudentAccountsPreflight(file, readers, gate);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("DRY_RUN_MISSING");
  });

  it("unauthorized role (registrar / student) ⇒ HOLD with UNAUTHORIZED", async () => {
    const file = rows(seq(1, 3));
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({ total: 3, linked: 0 });
    for (const actor_role of ["registrar", "student", "finance_officer"]) {
      const report = await runStudentAccountsPreflight(
        file,
        readers,
        makeGate(file, snapshot, { actor_role }),
      );
      expect(report.decision.decision).toBe("HOLD");
      expect(report.decision.hold_reasons).toContain("UNAUTHORIZED_ROLE");
      expect(report.decision.batch_flags).toContain("UNAUTHORIZED");
    }
    // system_admin is authorized (same contract as IMPORT_ROLES_BY_TYPE).
    const ok = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot, { actor_role: "system_admin" }),
    );
    expect(ok.decision.decision).toBe("GO");
  });

  it("provenance gates: unproven importer SHA / deploy proof / wrong project ⇒ HOLD", async () => {
    const file = rows(seq(1, 3));
    const readers = makeReaders({ unlinked: [1, 2, 3] });
    const snapshot = makeSnapshot({ total: 3, linked: 0 });

    const noSha = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot, { importer_source_sha_proven: false }),
    );
    expect(noSha.decision.decision).toBe("HOLD");
    expect(noSha.decision.hold_reasons).toContain("IMPORTER_SOURCE_UNPROVEN");

    const noDeploy = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot, { deploy_proof_proven: false }),
    );
    expect(noDeploy.decision.decision).toBe("HOLD");
    expect(noDeploy.decision.hold_reasons).toContain("DEPLOY_PROOF_UNPROVEN");

    const wrongProject = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot, { expected_project_ref: "other-project-ref" }),
    );
    expect(wrongProject.decision.decision).toBe("HOLD");
    expect(wrongProject.decision.hold_reasons).toContain("PROJECT_REF_MISMATCH");
  });

  it("SNAPSHOT_MISMATCH: linked profile whose recorded email disagrees with the file", async () => {
    const file = [row(1)];
    const readers = makeReaders({
      linked: [1],
      profileEmailOverride: { 1: EMAIL(9) }, // prod profile carries another email
    });
    const snapshot = makeSnapshot({ total: 1, linked: 1 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.SNAPSHOT_MISMATCH).toBe(1);
    expect(report.summary.ALREADY_LINKED).toBe(0);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("SNAPSHOT_MISMATCH_PRESENT");
  });

  it("tampered snapshot hash ⇒ HOLD with SNAPSHOT_MISMATCH_PRESENT", () => {
    const snapshot = {
      ...makeSnapshot({ total: 3, linked: 0 }),
      snapshot_hash: "0".repeat(64),
    };
    expect(verifyStudentAccountsSnapshotHash(snapshot)).toBe(false);
    const summary = {
      ...Object.fromEntries(
        STUDENT_ACCOUNTS_PREFLIGHT_CODES.map((c) => [c, 0]),
      ),
      file_rows: 0,
      READY_TO_CREATE: 0,
    } as Parameters<typeof evaluateStudentAccountsGate>[0];
    const decision = evaluateStudentAccountsGate(
      summary,
      makeGate([], snapshot),
    );
    expect(decision.decision).toBe("HOLD");
    expect(decision.hold_reasons).toContain("SNAPSHOT_MISMATCH_PRESENT");
    expect(decision.batch_flags).toContain("SNAPSHOT_MISMATCH");
  });

  it("invalid email ⇒ INVALID_EMAIL + HOLD", async () => {
    const file = [row(1, { university_email: "not-an-email" })];
    const readers = makeReaders({ unlinked: [1] });
    const snapshot = makeSnapshot({ total: 1, linked: 0 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.INVALID_EMAIL).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("INVALID_EMAIL_PRESENT");
  });

  it("student not found ⇒ STUDENT_NOT_FOUND + HOLD", async () => {
    const file = [row(1)];
    const readers = makeReaders({}); // production knows no such profile
    const snapshot = makeSnapshot({ total: 0, linked: 0 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.STUDENT_NOT_FOUND).toBe(1);
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("STUDENT_NOT_FOUND_PRESENT");
  });

  it("empty academic_number rows are each STUDENT_NOT_FOUND, never DUPLICATE_IN_FILE", () => {
    const file = [
      row(1, { academic_number: "" }),
      row(2, { academic_number: "" }), // same email shape, still not a pair-dup
    ];
    const classified = classifyStudentAccountsPreflightRows(file, [], new Set());
    expect(classified[0]?.code).toBe("STUDENT_NOT_FOUND");
    expect(classified[1]?.code).toBe("STUDENT_NOT_FOUND");
  });

  it("is_active=false on an unlinked profile ⇒ CONFLICT (validator parity)", () => {
    const file = [row(1, { is_active: false })];
    const classified = classifyStudentAccountsPreflightRows(
      file,
      [{ academic_number: AC(1), email: null, user_linked: false }],
      new Set(),
    );
    expect(classified[0]?.code).toBe("CONFLICT");
  });
});

/* ---------------- retry + idempotency ---------------- */

describe("partial failure retry and idempotent rerun", () => {
  it("partial failure retry: refreshed snapshot (unlinked 3→2) makes the retry GO-eligible", async () => {
    const file = rows(seq(1, 566));
    // First attempt created the account for student 564 only; 565/566 failed.
    // Production moved: linked 843→844, unlinked 3→2. Snapshot is refreshed.
    const readers = makeReaders({
      linked: seq(1, 564),
      unlinked: seq(565, 566),
    });
    const snapshot = makeSnapshot({ total: 846, linked: 844 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.ALREADY_LINKED).toBe(564);
    expect(report.summary.READY_TO_CREATE).toBe(2);
    expect(report.decision.binding_rule).toEqual({
      ready_to_create: 2,
      snapshot_unlinked_profiles: 2,
      satisfied: true,
    });
    expect(report.decision.decision).toBe("GO");
  });

  it("retry with a STALE pre-attempt snapshot (unlinked still 3) ⇒ HOLD", async () => {
    const file = rows(seq(1, 566));
    const readers = makeReaders({
      linked: seq(1, 564),
      unlinked: seq(565, 566),
    });
    const staleCounts = makeSnapshot({ total: 846, linked: 843 }); // unlinked=3
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, staleCounts),
    );
    expect(report.decision.decision).toBe("HOLD");
    expect(report.decision.hold_reasons).toContain("BINDING_RULE_VIOLATION");
  });

  it("idempotent rerun after full success: all linked, unlinked=0 ⇒ GO, creates nothing", async () => {
    const file = rows(seq(1, 566));
    const readers = makeReaders({ linked: seq(1, 566) });
    const snapshot = makeSnapshot({ total: 846, linked: 846 });
    const report = await runStudentAccountsPreflight(
      file,
      readers,
      makeGate(file, snapshot),
    );
    expect(report.summary.READY_TO_CREATE).toBe(0);
    expect(report.summary.ALREADY_LINKED).toBe(566);
    expect(report.decision.decision).toBe("GO");
    expect(report.decision.hold_reasons).toEqual([]);
  });
});

/* ---------------- snapshot contract helpers ---------------- */

describe("production snapshot contract", () => {
  it("derives unlinked = total - linked and embeds a verifiable hash", () => {
    const s = makeSnapshot({ total: 846, linked: 843 });
    expect(s.unlinked_profiles).toBe(3);
    expect(s.schema_version).toBe(1);
    expect(verifyStudentAccountsSnapshotHash(s)).toBe(true);
    // any count tamper breaks the hash
    expect(verifyStudentAccountsSnapshotHash({ ...s, unlinked_profiles: 4 })).toBe(
      false,
    );
  });

  it("file hash is deterministic and order/key-insensitive per key order", () => {
    const a = computeStudentAccountsFileHash([row(1)]);
    const b = computeStudentAccountsFileHash([
      { ...row(1) }, // same content
    ]);
    expect(a).toBe(b);
    const reorderedKeys = computeStudentAccountsFileHash([
      Object.fromEntries(Object.entries(row(1)).reverse()),
    ]);
    expect(reorderedKeys).toBe(a);
    const different = computeStudentAccountsFileHash([row(2)]);
    expect(different).not.toBe(a);
  });
});
