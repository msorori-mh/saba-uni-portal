import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const feature = readFileSync("src/lib/portal-features.ts", "utf8");
const live = readFileSync("src/lib/staff-self-service-live.ts", "utf8");
const actions = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveActions.tsx",
  "utf8",
);
const staffRoute = readFileSync("src/routes/staff.index.tsx", "utf8");
const adminRoute = readFileSync("src/routes/admin/staff-management.tsx", "utf8");

describe("PORTAL_STAFF_SELF_SERVICE_LIVE_UI_BINDING_02C", () => {
  test("ships the controlled activation through one employee operational surface", () => {
    expect(feature).toContain("staffSelfServiceLive: true");
    expect(staffRoute).toContain("portalFeatures.staffSelfServiceLive");
    expect(adminRoute).toContain("portalFeatures.staffSelfServiceLive");
    expect(staffRoute).toContain("<StaffSelfServiceLiveActions");
    expect(staffRoute).toContain("<StaffSelfServiceLiveDashboard");
    expect(staffRoute).not.toContain("<StaffSelfServiceShowcase");
    expect(adminRoute).toContain("<EmployeeServicesShowcase");
  });

  test("binds employee and approver surfaces through the typed seam only", () => {
    expect(actions).toContain('variant: "employee" | "approver"');
    expect(actions).toContain("submitStaffServiceRequest");
    expect(actions).toContain("decideStaffServiceRequest");
    expect(actions).toContain("uploadStaffServiceAttachment");
    expect(actions).toContain("listAccessibleStaffServiceRequests");
    expect(actions).not.toContain("@/integrations/supabase/client");
  });

  test("covers every approved request service and attachment constraints", () => {
    for (const service of [
      "leave",
      "permission",
      "custody_transfer",
      "custody_return",
      "employment_certificate",
      "experience_certificate",
      "overtime",
      "training",
      "promotion_adjustment",
      "clearance",
    ]) {
      expect(actions).toContain(`value: "${service}"`);
    }
    expect(actions).toContain('accept="application/pdf,image/jpeg,image/png"');
    expect(actions).toContain("PDF / JPG / PNG — 10MB");
  });

  test("reads a minimal RLS-scoped projection and preserves atomic writes", () => {
    expect(live).toContain('fromReadModel("staff_service_requests")');
    expect(live).toContain(
      '"id,request_no,service_type,status,decision_reason,created_at,updated_at"',
    );
    expect(live).not.toMatch(/fromReadModel\([^)]+\)[\s\S]{0,300}\.(insert|update|delete|upsert)/);
    expect(live).toContain('"staff_service_submit_request"');
    expect(live).toContain('"staff_service_decide_request"');
  });

  test("requires a reason for rejection and exposes no optimistic approval state", () => {
    expect(actions).toContain("ملاحظة القرار — إلزامية عند الرفض");
    expect(actions).toContain("await decideStaffServiceRequest");
    expect(actions).toContain("await onChanged()");
    expect(actions).not.toMatch(/setRequests|optimistic/i);
  });
});
