import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seed = readFileSync("scripts/staff-multi-role-demo-accounts-02i.sql", "utf8");
const cleanup = readFileSync("scripts/staff-multi-role-demo-accounts-02i-cleanup.sql", "utf8");

describe("PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I", () => {
  it("creates four dedicated staff-domain TEST_ONLY identities", () => {
    for (const email of [
      "test.manager01@staff.usr.edu.ye",
      "test.hr01@staff.usr.edu.ye",
      "test.finance01@staff.usr.edu.ye",
      "test.admin01@staff.usr.edu.ye",
    ]) expect(seed).toContain(email);
    expect(seed).toContain("PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I");
    expect(seed).toContain("TEST-STAFF-02I-");
  });

  it("covers every staff-service role without widening legacy access", () => {
    for (const role of ["direct_manager", "hr", "finance", "administrator"])
      expect(seed).toContain(`'service_role','${role}'`);
    expect(seed.match(/insert into public\.user_roles/gi)?.length ?? 0).toBe(1);
    expect(seed).toMatch(/'admin',v_now/);
    expect(seed).not.toMatch(/'hr_officer'::app_role|'finance_officer'::app_role|'department_head'::app_role/);
  });

  it("requires operator-supplied password material and never commits the credential", () => {
    expect(seed).toContain("current_setting('app.staff_demo_password_02i', true)");
    expect(seed).toContain("crypt(v_password,gen_salt('bf'))");
    expect(seed).not.toContain("Login@123");
    expect(seed).not.toMatch(/encrypted_password\s*=\s*['\"]/i);
  });

  it("is idempotent, collision guarded, and post-verifies exact counts", () => {
    expect(seed.match(/on conflict/gi)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(seed).toContain("02I fail-closed: auth collision");
    expect(seed).toContain("02I fail-closed: identity collision");
    expect(seed).toContain("02I fail-closed: staff profile collision");
    expect(seed).toContain("02I fail-closed: post-insert verification failed");
    expect(seed).not.toMatch(/session_replication_role|disable\s+trigger|truncate/i);
  });

  it("provides a narrow marker-gated cleanup", () => {
    expect(cleanup).toContain("cleanup fail-closed");
    expect(cleanup).toContain("PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I");
    expect(cleanup).toContain("TEST-STAFF-02I-%");
    expect(cleanup).not.toMatch(/truncate|session_replication_role|disable\s+trigger/i);
    expect(cleanup).not.toMatch(/delete\s+from\s+public\.departments/i);
  });
});
