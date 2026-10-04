import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isInternalPortalPath } from "../../src/lib/portal-scope";
import { DELIVERY_MONITORING_ROLES, canSeeDeliveryMonitoring } from "../../src/lib/faculty-portal/delivery-monitoring-roles";

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
  test("monitoring tab roles mirror cdp_delivery_monitoring", () => {
    expect([...DELIVERY_MONITORING_ROLES].sort()).toEqual(
      ["admin", "dean", "department_head", "registrar", "student_affairs", "system_admin"],
    );
    expect(canSeeDeliveryMonitoring(["faculty_member"])).toBe(false);
    expect(canSeeDeliveryMonitoring(["faculty_member", "department_head"])).toBe(true);
    const shell = readFileSync("src/components/portal/FacultyPortalShell.tsx", "utf8");
    expect(shell).toContain("canMonitorDelivery");
    expect(shell).not.toMatch(/NAV_ITEMS: NavItem\[\] = \[[^\]]*lecture-monitoring/);
  });
});
