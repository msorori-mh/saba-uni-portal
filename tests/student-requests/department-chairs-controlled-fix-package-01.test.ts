import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const sql = readFileSync(
  join(root, "docs/migration-drafts/DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01.sql"),
  "utf8",
);
const report = readFileSync(
  join(root, "docs/DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01-REPORT.md"),
  "utf8",
);

describe("department chairs controlled fix package", () => {
  it("uses only read-only-report identity anchors and resolves unit/role fail closed", () => {
    for (const id of [
      "11111111-1111-4111-8111-111111111111",
      "ce485c67-5f7c-498d-b120-4b1130a86ae8",
      "22222222-2222-4222-8222-222222222222",
      "97acbe02-c59c-409c-8d51-7d4ef72e6db7",
      "d08a8509-4c04-472e-885f-053a80be12ec",
      "d4aaa5c9-72d1-4996-b0e8-d30c6327da6e",
      "6f9f004d-c5f6-4dfe-b212-7f79ce8658e3",
      "f602b62c-194b-4591-8e9c-956e5cbb347d",
      "c1fe6084-e594-482e-a178-ac8eaffed376",
      "7ab0b14f-9007-40d6-9aaf-f1cba454ac8f",
      "912bdb96-3fb9-494c-8caa-7778c7d0d402",
      "4d0f434e-57ab-40b2-8a6f-5f27f330db97",
    ])
      expect(sql).toContain(id);
    expect(sql).toContain("select id into strict v_unit_id");
    expect(sql).toContain("select id into strict v_role_id");
    expect(sql).not.toMatch(/v_(unit|role)_id\s+constant/i);
  });

  it("performs exactly the approved minimal writes without delete or unrelated identities", () => {
    expect(sql.match(/update public\.request_processing_assignments/g)).toHaveLength(1);
    expect(sql.match(/update public\.faculty_profiles/g)).toHaveLength(1);
    expect(sql.match(/insert into public\.request_processing_assignments/g)).toHaveLength(1);
    expect(sql).not.toMatch(/^\s*delete\s+from\b/im);
    expect(sql).not.toContain("insert into public.faculty_profiles");
    expect(sql).not.toContain("insert into auth.users");
    expect(sql).toContain("set is_active=false");
  });

  it("guards zero one multiple pre-state and exact-one post-state invariants", () => {
    for (const token of [
      "CS_ACTIVE_CHAIR_PRECONDITION_",
      "IT_ACTIVE_CHAIR_PRECONDITION_",
      "IS_ACTIVE_CHAIR_PRECONDITION_",
      "CS_POSTCONDITION_",
      "IT_POSTCONDITION_",
      "IS_POSTCONDITION_",
      "get diagnostics v_rows=row_count",
    ])
      expect(sql).toContain(token);
    expect(sql).toContain("if v_count<>0");
    expect(sql).toContain("if v_count<>2");
    expect(sql.match(/if v_count<>1/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps Khaled sole IT chair and Ramzi byte-for-byte unchanged", () => {
    expect(sql).toContain("v_khaled_profile_before");
    expect(sql).toContain("v_ramzi_profile_before");
    expect(sql).toContain("v_khaled_assignment_before");
    expect(sql).toContain("v_ramzi_assignment_before");
    expect(sql).toContain("KHALED_OR_RAMZI_CHANGED");
    expect(report).toContain("Khaled remains the sole IT chair");
    expect(report).toContain("Ramzi and his IS assignment remain byte-for-byte");
  });

  it("requires controlled authorization and rollback only by a new forward correction", () => {
    expect(sql).toContain("CONTROLLED_FIX_TICKET_REQUIRED");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("ROLLBACK-BY-FORWARD-CORRECTION");
    expect(sql).toContain("Never infer or hard-code the generated CS assignment id");
    expect(report).toContain("No SQL, Supabase connection, production read/write");
    expect(report).toContain("HOLD_REQUIRES_SEPARATE_EXPLICIT_AUTHORIZATION");
  });
});
