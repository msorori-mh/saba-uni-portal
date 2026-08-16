import { describe, expect, it } from "vitest";
import {
  p1ArchiveIssuesDocument,
  routeP1StaffStep,
} from "@/lib/student-requests/p1/p1-staff-specialized-actions";

describe("P1 staff step routing (engine reuse)", () => {
  it("ignores non-P1 request types", () => {
    expect(routeP1StaffStep({ requestTypeCode: "enrollment_suspension", stepKey: "initial_review" }))
      .toEqual({ kind: "not_p1" });
    expect(routeP1StaffStep({ requestTypeCode: "enrollment_certificate", stepKey: "archive" }))
      .toEqual({ kind: "not_p1" });
  });

  it("routes ordinary P1 steps to the existing atomic action", () => {
    for (const stepKey of ["student_affairs_review", "registrar_finalize", "archive"]) {
      expect(routeP1StaffStep({ requestTypeCode: "october_exam_entry_form", stepKey }))
        .toEqual({ kind: "atomic_action" });
    }
  });

  it("routes payment to the existing external payment confirmation RPC", () => {
    for (const code of ["october_exam_entry_form", "replacement_student_card"]) {
      expect(routeP1StaffStep({ requestTypeCode: code, stepKey: "payment_confirmation" }))
        .toEqual({ kind: "external_payment_confirmation" });
    }
  });

  it("routes only the two effect steps to thin specialized actions", () => {
    expect(routeP1StaffStep({ requestTypeCode: "replacement_student_card", stepKey: "card_issuance" }))
      .toEqual({ kind: "replacement_card_issuance" });
    expect(routeP1StaffStep({ requestTypeCode: "grade_appeal", stepKey: "registrar_apply_result" }))
      .toEqual({ kind: "final_result_appeal_apply" });
    // cross-service leakage is impossible
    expect(routeP1StaffStep({ requestTypeCode: "grade_appeal", stepKey: "card_issuance" }))
      .toEqual({ kind: "atomic_action" });
  });

  it("never issues a document on P1 archive", () => {
    expect(p1ArchiveIssuesDocument()).toBe(false);
  });
});
