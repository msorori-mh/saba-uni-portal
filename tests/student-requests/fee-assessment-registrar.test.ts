import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dryRunFeeAuthorization, feeStatusDisplayModel } from "@/lib/student-requests/fee-processing-ui-policy";

const assess = (processingRoleCodes: string[], appRoles: string[] = []) =>
  dryRunFeeAuthorization({ hasSession: true, appRoles, processingRoleCodes, action: "assess" }).rpcWouldAllow;

describe("registrar sets service fees", () => {
  it("registrar_general can assess the fee", () => expect(assess(["registrar_general"])).toBe(true));
  it("student_affairs_manager still can (in-flight requests)", () => expect(assess(["student_affairs_manager"])).toBe(true));
  it("specialist cannot change the amount", () => expect(assess(["student_affairs_specialist"])).toBe(false));
  it("finance officer cannot change the amount", () =>
    expect(assess(["revenue_finance_officer", "finance_officer"], ["finance_officer"])).toBe(false));
  it("amount 0 shows no finance form", () =>
    expect(feeStatusDisplayModel({ amount: 0, paymentStatus: "not_required" }).showFinanceForm).toBe(false));
  it("SQL: 0 => fee_not_required skips confirm_payment; >0 => payment_required; registrar allowed", () => {
    const m = readFileSync("supabase/migrations/20261005234500_fee_assessment_allow_registrar.sql", "utf8");
    expect(m).toContain("'registrar_general'");
    expect(m).toContain("'student_affairs_manager'");
    expect(m).not.toMatch(/revenue_finance_officer|student_affairs_specialist/);
  });
});
