import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const owner = read("src/lib/student-requests/student-request-owner.server.ts");
const tracking = read("src/lib/student-requests/student-tracking.functions.ts");
const fee = read("src/lib/student-request-fee.functions.ts");
const screen = read("src/components/student-requests/StudentRequestDetailsScreen.tsx");

describe("student request owner lookup — no PostgREST embed (production defect 2026-10-07)", () => {
  it("resolves the owner with two plain reads and fails closed", () => {
    expect(owner).toContain('.from("student_requests")');
    expect(owner).toContain('.select("id, request_number, student_profile_id")');
    expect(owner).toContain('.from("student_profiles")');
    expect(owner).not.toMatch(/\.select\([^)]*!inner/);
    expect(owner.match(/throw new Error\(/g)?.length).toBe(2);
  });

  it("no caller embeds student_profiles from student_requests (there is no FK)", () => {
    for (const src of [tracking, fee]) {
      expect(src).not.toContain("student_profiles!inner");
      expect(src).toContain("resolveStudentRequestOwner(");
    }
  });

  it("ownership still denies a missing owner or another user", () => {
    expect(tracking).toContain("if (!owner || !ownerUserId || ownerUserId !== userId) {");
    expect(tracking).toContain('throw new Error("غير مصرح")');
  });

  it("request history is shown in Arabic, never as a raw event code", () => {
    expect(screen).toContain("{eventLabel(event.event_type)}");
    expect(screen).not.toContain("{event.event_type}</div>");
    expect(screen).toContain('submitted: "تم إرسال الطلب"');
  });
});
