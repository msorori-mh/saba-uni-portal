import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const markers = readFileSync(
  join(root, "supabase/migrations/20260727120000_b1_25_academic_effect_markers_01.sql"),
  "utf8",
);
const functions = readFileSync(
  join(root, "supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql"),
  "utf8",
);
const actOn = readFileSync(
  join(root, "supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql"),
  "utf8",
);

describe("B1 academic effects go-live source contract", () => {
  it("adds forward-only effect markers without student_visible or backfill", () => {
    expect(markers).toContain("effect_applied_at");
    expect(markers).toContain("enrollment_suspension_details");
    expect(markers).toContain("transfer_request_details");
    expect(markers).toContain("file_withdrawal_details");
    expect(markers).not.toMatch(/student_visible/i);
    expect(markers).not.toMatch(/\bUPDATE\b/i);
    expect(markers).not.toMatch(/\bDELETE\b/i);
  });

  it("defines independent effect functions and a strict dispatcher", () => {
    for (const name of [
      "apply_b1_enrollment_suspension_effect",
      "apply_b1_excused_absence_effect",
      "apply_b1_department_transfer_effect",
      "apply_b1_final_chance_effect",
      "apply_b1_file_withdrawal_effect",
      "apply_b1_academic_effect_for_request",
    ]) {
      expect(functions).toContain(name);
    }
    expect(functions).toContain("b1.atomic_action");
    expect(functions).toContain("B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED");
    expect(functions).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(functions).toMatch(/REVOKE ALL[\s\S]*authenticated/i);
    expect(functions).not.toMatch(/GRANT EXECUTE[\s\S]*authenticated/i);
  });

  it("integrates effects into act_on only on apply_decision terminals", () => {
    expect(actOn).toContain("apply_b1_academic_effect_for_request");
    expect(actOn).toContain("v_action='apply_decision'");
    expect(actOn).toContain("file_withdrawal");
    expect(actOn).toContain("set_config('b1.atomic_action','1',true)");
  });
});
