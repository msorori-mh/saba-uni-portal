import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822140000_staff_correspondence_recipient_rls_fix_02h.sql",
  "utf8",
);

describe("PORTAL_STAFF_CORRESPONDENCE_RECIPIENT_RLS_FIX_02H", () => {
  it("binds the recipient row to the outer correspondence id", () => {
    expect(migration).toContain(
      "recipient.correspondence_id = staff_correspondence.id",
    );
    expect(migration).toContain("recipient.recipient_user_id = auth.uid()");
    expect(migration).not.toContain("r.correspondence_id = r.id");
  });

  it("keeps publication, HR and administrator guards", () => {
    expect(migration).toContain("published_at is not null");
    expect(migration).toContain("staff_service_has_role(auth.uid(), 'hr', sender_department_id)");
    expect(migration).toContain("staff_service_is_admin(auth.uid())");
    expect(migration).toContain("to authenticated");
  });

  it("changes only the named SELECT policy", () => {
    expect(migration).toContain("alter policy staff_correspondence_recipient_or_publisher_read");
    expect(migration).toContain("STAFF_CORRESPONDENCE_02H_POLICY_MISSING");
    expect(migration).not.toMatch(/drop\s+policy/i);
    expect(migration).not.toMatch(/insert|update|delete\s+from|grant\s+(insert|update|delete)/i);
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security|session_replication_role/i);
  });
});
