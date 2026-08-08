import { describe, expect, test } from "bun:test";
import {
  canTransitionEmployerVerification,
  canTransitionFollowup,
  canTransitionOpportunity,
  evaluateRecordAccess,
  FOLLOWUP_TERMINAL_STATES,
  GRADUATE_AFFAIRS_MANAGER_ROLE,
  GRADUATE_AFFAIRS_SPECIALIST_ROLE,
  GRADUATE_AFFAIRS_UNIT_CODE,
  isAssignmentActive,
  matchesAudienceScope,
  resolveStaffCapabilities,
  validateProfilePatch,
  type GraduateAffairsActor,
  type GraduateAffairsAssignment,
  type RecordScope,
} from "../../src/lib/graduates-affairs/authorization";
import {
  validateOfficialDecisionImportBatch,
  validateOfficialDecisionImportRow,
  type OfficialDecisionImportRow,
} from "../../src/lib/graduates-affairs/import-validation";

const NOW = new Date("2026-08-01T00:00:00Z");

const RECORD: RecordScope = {
  recordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  programId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  departmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const OTHER_DEPARTMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const emptyActor: GraduateAffairsActor = {
  userId: "99999999-9999-4999-8999-999999999999",
  ownGraduateRecordIds: [],
  assignments: [],
  activeFollowupRecordIds: [],
};

function assignment(overrides: Partial<GraduateAffairsAssignment>): GraduateAffairsAssignment {
  return {
    unitCode: GRADUATE_AFFAIRS_UNIT_CODE,
    roleCode: GRADUATE_AFFAIRS_MANAGER_ROLE,
    isActive: true,
    startsAt: null,
    endsAt: null,
    departmentIds: [],
    ...overrides,
  };
}

describe("record access matrix", () => {
  test("allows the graduate who owns the record", () => {
    const actor = { ...emptyActor, ownGraduateRecordIds: [RECORD.recordId] };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({ allowed: true, via: "self" });
  });

  test("self takes precedence over staff capabilities", () => {
    const actor = {
      ...emptyActor,
      ownGraduateRecordIds: [RECORD.recordId],
      assignments: [assignment({})],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({ allowed: true, via: "self" });
  });

  test("allows an active manager for any department (college scope)", () => {
    const actor = { ...emptyActor, assignments: [assignment({})] };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({ allowed: true, via: "manager" });
    const otherDepartmentRecord = { ...RECORD, departmentId: OTHER_DEPARTMENT_ID };
    expect(evaluateRecordAccess(actor, otherDepartmentRecord, NOW)).toEqual({
      allowed: true,
      via: "manager",
    });
  });

  test("allows a specialist whose scope contains the record department", () => {
    const actor = {
      ...emptyActor,
      assignments: [
        assignment({
          roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
          departmentIds: [RECORD.departmentId],
        }),
      ],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: true,
      via: "specialist",
    });
  });

  test("denies a specialist scoped to a different department", () => {
    const actor = {
      ...emptyActor,
      assignments: [
        assignment({
          roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
          departmentIds: [OTHER_DEPARTMENT_ID],
        }),
      ],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies a specialist with an empty department scope", () => {
    const actor = {
      ...emptyActor,
      assignments: [
        assignment({ roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE, departmentIds: [] }),
      ],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("allows the direct assignee of an active follow-up for the record", () => {
    const actor = { ...emptyActor, activeFollowupRecordIds: [RECORD.recordId] };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: true,
      via: "direct_assignee",
    });
  });

  test("denies a direct assignee of a different record", () => {
    const actor = { ...emptyActor, activeFollowupRecordIds: [OTHER_DEPARTMENT_ID] };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies an inactive assignment", () => {
    const actor = { ...emptyActor, assignments: [assignment({ isActive: false })] };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies an expired assignment (endsAt in the past)", () => {
    const actor = {
      ...emptyActor,
      assignments: [assignment({ endsAt: "2026-07-01T00:00:00Z" })],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies an assignment that has not started yet", () => {
    const actor = {
      ...emptyActor,
      assignments: [assignment({ startsAt: "2026-09-01T00:00:00Z" })],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies staff from another unit even with a matching role code", () => {
    const actor = {
      ...emptyActor,
      assignments: [assignment({ unitCode: "registrar" })],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies an unknown role in the graduates-affairs unit (no admin bypass)", () => {
    const actor = {
      ...emptyActor,
      assignments: [assignment({ roleCode: "admin" })],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies a null userId even when capabilities would otherwise match", () => {
    const actor: GraduateAffairsActor = {
      ...emptyActor,
      userId: null,
      ownGraduateRecordIds: [RECORD.recordId],
      assignments: [assignment({})],
      activeFollowupRecordIds: [RECORD.recordId],
    };
    expect(evaluateRecordAccess(actor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });

  test("denies an empty actor with no capabilities", () => {
    expect(evaluateRecordAccess(emptyActor, RECORD, NOW)).toEqual({
      allowed: false,
      reason: "graduate_record_access_denied",
    });
  });
});

describe("assignment activity window", () => {
  test("is active inside the window and inactive at the exclusive end boundary", () => {
    const bounded = assignment({
      startsAt: "2026-07-01T00:00:00Z",
      endsAt: "2026-08-01T00:00:00Z",
    });
    expect(isAssignmentActive(bounded, new Date("2026-07-15T00:00:00Z"))).toBe(true);
    expect(isAssignmentActive(bounded, new Date("2026-08-01T00:00:00Z"))).toBe(false);
    expect(isAssignmentActive(bounded, new Date("2026-07-01T00:00:00Z"))).toBe(true);
  });

  test("fails closed on unparsable window boundaries", () => {
    expect(isAssignmentActive(assignment({ startsAt: "not-a-date" }), NOW)).toBe(false);
    expect(isAssignmentActive(assignment({ endsAt: "not-a-date" }), NOW)).toBe(false);
  });

  test("resolveStaffCapabilities unions specialist departments across active assignments", () => {
    const actor = {
      ...emptyActor,
      assignments: [
        assignment({
          roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
          departmentIds: [RECORD.departmentId],
        }),
        assignment({
          roleCode: GRADUATE_AFFAIRS_SPECIALIST_ROLE,
          departmentIds: [OTHER_DEPARTMENT_ID],
          endsAt: "2026-07-01T00:00:00Z",
        }),
      ],
    };
    expect(resolveStaffCapabilities(actor, NOW)).toEqual({
      isManager: false,
      specialistDepartmentIds: [RECORD.departmentId],
    });
  });
});

describe("graduate profile patch validation", () => {
  test("accepts a full valid patch", () => {
    const result = validateProfilePatch({
      public_display_name: "خريج مثال",
      preferred_contact_channel: "email",
      career_summary: "مهندس برمجيات",
      profile_visibility: "graduates_affairs",
    });
    expect(result).toEqual({
      ok: true,
      fields: {
        public_display_name: "خريج مثال",
        preferred_contact_channel: "email",
        career_summary: "مهندس برمجيات",
        profile_visibility: "graduates_affairs",
      },
    });
  });

  test("accepts a subset patch", () => {
    expect(validateProfilePatch({ profile_visibility: "private" })).toEqual({
      ok: true,
      fields: { profile_visibility: "private" },
    });
  });

  test("accepts an empty patch as a valid no-change replacement", () => {
    expect(validateProfilePatch({})).toEqual({ ok: true, fields: {} });
  });

  test("rejects any key outside the mutable allowlist", () => {
    expect(validateProfilePatch({ record_state: "revoked" })).toEqual({
      ok: false,
      reason: "graduate_profile_field_not_mutable",
    });
    expect(
      validateProfilePatch({ profile_visibility: "private", student_profile_id: "x" }),
    ).toEqual({ ok: false, reason: "graduate_profile_field_not_mutable" });
  });

  test("rejects enum values outside the allowed lists", () => {
    expect(validateProfilePatch({ preferred_contact_channel: "sms" })).toEqual({
      ok: false,
      reason: "graduate_profile_invalid_value",
    });
    expect(validateProfilePatch({ profile_visibility: "everyone" })).toEqual({
      ok: false,
      reason: "graduate_profile_invalid_value",
    });
  });

  test("rejects non-string values", () => {
    expect(validateProfilePatch({ career_summary: 42 })).toEqual({
      ok: false,
      reason: "graduate_profile_invalid_value",
    });
    expect(validateProfilePatch({ public_display_name: null })).toEqual({
      ok: false,
      reason: "graduate_profile_invalid_value",
    });
  });
});

describe("follow-up and employer verification transitions", () => {
  test("allows the legal follow-up transitions", () => {
    expect(canTransitionFollowup("open", "in_progress")).toBe(true);
    expect(canTransitionFollowup("open", "cancelled")).toBe(true);
    expect(canTransitionFollowup("in_progress", "completed")).toBe(true);
    expect(canTransitionFollowup("in_progress", "cancelled")).toBe(true);
  });

  test("rejects illegal follow-up transitions including any move out of terminal states", () => {
    expect(canTransitionFollowup("open", "completed")).toBe(false);
    expect(canTransitionFollowup("in_progress", "open")).toBe(false);
    for (const terminal of FOLLOWUP_TERMINAL_STATES) {
      expect(canTransitionFollowup(terminal, "open")).toBe(false);
      expect(canTransitionFollowup(terminal, "in_progress")).toBe(false);
      expect(canTransitionFollowup(terminal, "completed")).toBe(false);
      expect(canTransitionFollowup(terminal, "cancelled")).toBe(false);
    }
  });

  test("allows the legal employer verification transitions", () => {
    expect(canTransitionEmployerVerification("unverified", "in_review")).toBe(true);
    expect(canTransitionEmployerVerification("in_review", "verified")).toBe(true);
    expect(canTransitionEmployerVerification("in_review", "rejected")).toBe(true);
  });

  test("rejects illegal employer verification transitions", () => {
    expect(canTransitionEmployerVerification("unverified", "verified")).toBe(false);
    expect(canTransitionEmployerVerification("unverified", "rejected")).toBe(false);
    expect(canTransitionEmployerVerification("verified", "in_review")).toBe(false);
    expect(canTransitionEmployerVerification("rejected", "in_review")).toBe(false);
  });

  test("re-exports the opportunity state machine from the foundation", () => {
    expect(canTransitionOpportunity("in_review", "published")).toBe(true);
    expect(canTransitionOpportunity("draft", "published")).toBe(false);
  });
});

describe("audience scope matching", () => {
  test("matches all_graduates regardless of ids", () => {
    expect(matchesAudienceScope({ all_graduates: true }, RECORD.programId, RECORD.departmentId)).toBe(
      true,
    );
  });

  test("matches on program or department membership", () => {
    expect(
      matchesAudienceScope({ program_ids: [RECORD.programId] }, RECORD.programId, RECORD.departmentId),
    ).toBe(true);
    expect(
      matchesAudienceScope(
        { department_ids: [OTHER_DEPARTMENT_ID, RECORD.departmentId] },
        RECORD.programId,
        RECORD.departmentId,
      ),
    ).toBe(true);
  });

  test("does not match empty, null, or non-object scopes", () => {
    expect(matchesAudienceScope({}, RECORD.programId, RECORD.departmentId)).toBe(false);
    expect(matchesAudienceScope(null, RECORD.programId, RECORD.departmentId)).toBe(false);
    expect(matchesAudienceScope(undefined, RECORD.programId, RECORD.departmentId)).toBe(false);
    expect(matchesAudienceScope("all_graduates", RECORD.programId, RECORD.departmentId)).toBe(false);
    expect(matchesAudienceScope([RECORD.programId], RECORD.programId, RECORD.departmentId)).toBe(
      false,
    );
  });

  test("does not match non-matching or wrongly-typed id lists", () => {
    expect(
      matchesAudienceScope({ program_ids: [OTHER_DEPARTMENT_ID] }, RECORD.programId, RECORD.departmentId),
    ).toBe(false);
    expect(
      matchesAudienceScope(
        { program_ids: RECORD.programId, all_graduates: false },
        RECORD.programId,
        RECORD.departmentId,
      ),
    ).toBe(false);
  });
});

const validImportRow: OfficialDecisionImportRow = {
  studentProfileId: "22222222-2222-4222-8222-222222222222",
  sourceKind: "university_system_of_record_import",
  sourceReference: "SIS-IMPORT-2026-0001",
  decisionState: "approved",
  approvedAt: "2026-07-20T00:00:00Z",
  approvedBy: "33333333-3333-4333-8333-333333333333",
  effectiveGraduationDate: "2026-07-01",
  programId: RECORD.programId,
  departmentId: RECORD.departmentId,
  academicSnapshot: { degree: "source-owned", finalResultFreeze: "approved" },
  sourcePayloadSha256: "a".repeat(64),
};

describe("official decision import validation", () => {
  test("accepts a fully valid batch", () => {
    expect(
      validateOfficialDecisionImportBatch([
        validImportRow,
        { ...validImportRow, sourceReference: "SIS-IMPORT-2026-0002" },
      ]),
    ).toEqual({ ok: true });
  });

  test("flags each row-level error code on a crafted row", () => {
    const cases: [Partial<OfficialDecisionImportRow>, string][] = [
      [{ studentProfileId: "not-a-uuid" }, "invalid_student_profile_id"],
      [{ sourceKind: "manual_entry" }, "unapproved_graduation_source"],
      [{ sourceReference: "   " }, "missing_source_reference"],
      [{ decisionState: "pending" }, "official_decision_not_approved"],
      [{ approvedBy: null }, "missing_official_approval_provenance"],
      [{ approvedAt: "not-a-timestamp" }, "missing_official_approval_provenance"],
      [{ effectiveGraduationDate: null }, "missing_effective_graduation_date"],
      [{ effectiveGraduationDate: "32/13/2026" }, "missing_effective_graduation_date"],
      [{ programId: null }, "missing_academic_snapshot_scope"],
      [{ academicSnapshot: null }, "missing_immutable_academic_snapshot"],
      [{ academicSnapshot: {} }, "missing_immutable_academic_snapshot"],
      [{ sourcePayloadSha256: "A".repeat(64) }, "invalid_source_payload_sha256"],
      [{ sourcePayloadSha256: "abc" }, "invalid_source_payload_sha256"],
    ];
    for (const [overrides, code] of cases) {
      expect(validateOfficialDecisionImportRow({ ...validImportRow, ...overrides }, 0)).toContain(
        code,
      );
    }
  });

  test("reports all errors of a row, not just the first", () => {
    const codes = validateOfficialDecisionImportRow(
      { ...validImportRow, studentProfileId: "bad", decisionState: "revoked" },
      3,
    );
    expect(codes).toEqual(["invalid_student_profile_id", "official_decision_not_approved"]);
  });

  test("rejects the whole batch when any row fails (fail-closed)", () => {
    const result = validateOfficialDecisionImportBatch([
      validImportRow,
      { ...validImportRow, sourceReference: "SIS-IMPORT-2026-0002", decisionState: "pending" },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [{ index: 1, codes: ["official_decision_not_approved"] }],
    });
  });

  test("flags duplicate (sourceKind, sourceReference) on the later index only", () => {
    const result = validateOfficialDecisionImportBatch([
      validImportRow,
      { ...validImportRow },
      { ...validImportRow },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        { index: 1, codes: ["duplicate_source_reference"] },
        { index: 2, codes: ["duplicate_source_reference"] },
      ],
    });
  });

  test("treats the same reference under a different source kind as distinct", () => {
    expect(
      validateOfficialDecisionImportBatch([
        validImportRow,
        { ...validImportRow, sourceKind: "registrar_approved_decision" },
      ]),
    ).toEqual({ ok: true });
  });

  test("rejects an empty batch with a batch-level error", () => {
    expect(validateOfficialDecisionImportBatch([])).toEqual({
      ok: false,
      errors: [{ index: -1, codes: ["empty_import_batch"] }],
    });
  });
});
