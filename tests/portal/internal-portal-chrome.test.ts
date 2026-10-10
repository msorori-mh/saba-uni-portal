import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isInternalPortalPath } from "../../src/lib/portal-scope";
import { DELIVERY_MONITORING_COLLEGE_ROLES, canSeeDeliveryMonitoring } from "../../src/lib/faculty-portal/delivery-monitoring-roles";

describe("internal portal chrome", () => {
  test("portal paths hide the public header/footer", () => {
    for (const p of ["/student", "/student/progress", "/faculty-portal", "/faculty-portal/schedule", "/staff", "/staff/processing-requests"]) {
      expect(isInternalPortalPath(p)).toBe(true);
    }
  });
  test("public, login and mobile paths keep their layout", () => {
    for (const p of ["/", "/about", "/programs", "/verify-document", "/portal-login", "/student-login", "/staff-login", "/mobile/student", "/faculty"]) {
      expect(isInternalPortalPath(p)).toBe(false);
    }
  });
  // Owner rule (DELIVERY-MONITORING-POSITION-HEADS-01): in the faculty portal the
  // tab is for the dean and for department heads only; the RPC keeps its own roles.
  test("monitoring tab is for the dean and department heads only", () => {
    expect([...DELIVERY_MONITORING_COLLEGE_ROLES]).toEqual(["dean"]);
    expect(canSeeDeliveryMonitoring({ roles: ["faculty_member"], headedDepartmentIds: [] })).toBe(false);
    expect(canSeeDeliveryMonitoring({ roles: ["faculty_member"], headedDepartmentIds: ["d1"] })).toBe(true);
    const shell = readFileSync("src/components/portal/FacultyPortalShell.tsx", "utf8");
    expect(shell).toContain("canMonitorDelivery");
    expect(shell).not.toMatch(/NAV_ITEMS: NavItem\[\] = \[[^\]]*lecture-monitoring/);
  });
});
