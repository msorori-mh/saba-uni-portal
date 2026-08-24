import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const portal = read("src/components/staff-portal/StaffEmployeePortal.tsx");
const home = read("src/components/staff-portal/StaffEmployeeHome.tsx");
const legacyRoute = read("src/routes/staff.b1-requests.tsx");
const workspace = read("src/components/student-requests/b1/B1StaffWorkspace.tsx");

describe("PORTAL_STAFF_STUDENT_REQUESTS_VISIBILITY_02P", () => {
  test("restores the assigned student requests workspace inside the employee portal", () => {
    expect(portal).toContain('import { B1StaffWorkspace }');
    expect(portal).toContain('| "student-requests"');
    expect(portal).toContain('label: "الطلبات الطلابية المسندة"');
    expect(portal).toContain('section === "student-requests"');
    expect(portal).toContain("<B1StaffWorkspace />");
  });

  test("keeps a direct quick action on the compact employee home", () => {
    expect(home).toContain('"معالجة الطلبات الطلابية", "student-requests"');
  });

  test("preserves the previous direct route and backend-authoritative workspace", () => {
    expect(legacyRoute).toContain('createFileRoute("/staff/b1-requests")');
    expect(legacyRoute).toContain("component: B1StaffWorkspace");
    expect(workspace).toContain("getAssignedB1Requests");
    expect(workspace).toContain("getAssignedB1RequestDetails");
    expect(workspace).toContain("details.allowedAction");
    expect(workspace).not.toMatch(/from\s+["'][^"']*supabase/i);
  });
});
