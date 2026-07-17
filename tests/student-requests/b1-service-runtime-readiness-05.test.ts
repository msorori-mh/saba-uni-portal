import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { B1_SERVICE_ADAPTERS } from "../../src/lib/student-requests/request-service-adapter";
import { getStudentRequestFormDefinition } from "../../src/lib/student-requests/request-form-registry";

const migration = (name: string) => readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
const absenceSchema = migration("20260531235203_bea9042d-3ca6-417b-a8e6-1bfd1179394e.sql");
const transferSchema = migration("20260601003440_c775b556-16cd-4b62-82e3-9df0bde95360.sql");
const finalChanceSchema = migration("20260601002736_5cb74eaa-7632-4d47-b81b-0e53502e795a.sql");
const readiness = readFileSync(join(process.cwd(), "docs", "REQUEST-B1-SERVICE-RUNTIME-DRAFTS-05-READINESS.md"), "utf8");

describe("B1 service runtime drafts 05 readiness", () => {
  it("exposes every required enrollment suspension persistence input in the canonical form", () => {
    const form = getStudentRequestFormDefinition("enrollment_suspension");
    const duration = form?.sections.flatMap((section) => section.fields)
      .find((field) => field.name === "suspension_duration_type");
    expect(duration).toMatchObject({ type: "select", required: true });
    expect(duration?.options?.map((option) => option.value)).toEqual(["one_semester", "full_year"]);
    expect(B1_SERVICE_ADAPTERS.enrollment_suspension.validate({
      target_academic_year: "year",
      target_semester: "semester",
      suspension_reason: "reason",
      suspension_duration_type: "one_semester",
      terms_acknowledgment: true,
    }).valid).toBe(true);
  });

  it("pins department transfer to the proven stored relation and complete client fields", () => {
    expect(transferSchema).toContain("CREATE TABLE public.transfer_request_details");
    expect(transferSchema).toContain("current_program_id uuid NOT NULL");
    expect(transferSchema).toContain("requested_program_id uuid NOT NULL");
    expect(transferSchema).toContain("transfer_reason text NOT NULL");
    const adapter = B1_SERVICE_ADAPTERS.department_transfer;
    expect(adapter.detailBinding.contractKey).toBe("transfer_request_details");
    expect(adapter.detailBinding.fields).toContainEqual({ formField: "transfer_reason", detailField: "transfer_reason" });
    expect(adapter.detailBinding.clientWriteAllowed).toBe(false);
  });

  it("keeps excused absence fail-closed while its source and applied vocabularies differ", () => {
    expect(absenceSchema).toContain("CHECK (reason_type IN ('medical','family','emergency','other'))");
    expect(B1_SERVICE_ADAPTERS.excused_absence.validate({
      course_section_id: "section",
      absence_date: "2026-07-17",
      reason_type: "official",
      absence_reason_detail: "detail",
      excuse_documents: { fileName: "proof.pdf", storagePath: "private/request/proof.pdf" },
    }).valid).toBe(true);
    expect(B1_SERVICE_ADAPTERS.excused_absence.activationBlockedReason).toBeTruthy();
    expect(readiness).toContain("without rewriting history");
    expect(readiness).not.toMatch(/official\s*(?:=>|->)\s*(?:family|emergency)/i);
  });

  it("pins final chance to the historical table but permits only the approved new value", () => {
    expect(finalChanceSchema).toContain("CREATE TABLE public.extra_chance_details");
    expect(B1_SERVICE_ADAPTERS.final_chance.detailBinding.contractKey).toBe("extra_chance_details");
    const input = { target_academic_year: "year", target_semester: "semester", reason: "final exam", chance_type: "final_chance" };
    expect(getStudentRequestFormDefinition("final_chance")?.code).toBe("final_chance");
    expect(B1_SERVICE_ADAPTERS.final_chance.referenceResolvers).toHaveLength(2);
    expect(B1_SERVICE_ADAPTERS.final_chance.validate(input).valid).toBe(true);
    expect(B1_SERVICE_ADAPTERS.final_chance.validate({ ...input, chance_type: "additional_chance" }).valid).toBe(false);
    expect(B1_SERVICE_ADAPTERS.final_chance.validate({ chance_type: "final_chance" }).valid).toBe(false);
  });

  it("contains no portal financial ledger contract", () => {
    expect(JSON.stringify(B1_SERVICE_ADAPTERS)).not.toMatch(/fee_type|amount|currency|invoice|gateway|balance/i);
    for (const service of ["enrollment_suspension", "excused_absence", "file_withdrawal"] as const) {
      expect(B1_SERVICE_ADAPTERS[service].feePolicy).toBe("FREE_NO_PAYMENT");
    }
  });
});
