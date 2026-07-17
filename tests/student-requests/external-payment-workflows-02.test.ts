import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "docs", "migration-drafts", "EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql"),
  "utf8",
);

describe("external university payment workflow draft 2/3", () => {
  it("is source-only and creates inactive versioned drafts", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(sql).toContain("'draft'");
    expect(sql).toContain("false");
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP|ALTER)\b/i);
    expect(sql).not.toMatch(/UPDATE\s+public\./i);
  });

  it("covers only the two approved services and stored aliases", () => {
    expect(sql).toContain("ARRAY['department_transfer','transfer']");
    expect(sql).toContain("ARRAY['final_chance','extra_chance']");
    for (const forbidden of ["grade_recovery", "additional_chance", "additional_exam"]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("fails closed on ambiguous identities and uses direct assignment", () => {
    expect(sql).toContain("PAYMENT_WORKFLOW_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE");
    expect(sql).toContain("PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE");
    expect(sql).toContain("PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE");
    expect(sql).toContain("'specific_user'");
    expect(sql).toContain("'authorization', 'exactly_one_direct_assignee'");
  });

  it("encodes source and target department isolation", () => {
    expect(sql).toContain("'source_department_head_approval'");
    expect(sql).toContain("'scope','source_department'");
    expect(sql).toContain("'target_department_head_approval'");
    expect(sql).toContain("'scope','target_department'");
  });

  it("waits for exactly one external payment confirmation transition", () => {
    expect(sql).not.toMatch(/jsonb_build_object\('key','fee_assessment'/);
    expect(sql).toContain("awaiting_payment_confirmation");
    expect(sql).toContain("EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED");
    expect(
      sql.match(
        /'from','payment_confirmation','to','registrar_apply','result','payment_confirmed'/g,
      ),
    ).toHaveLength(2);
    expect(sql).not.toContain("payment_not_confirmed','to");
  });

  it("uses the closed B1 action and outcome vocabulary", () => {
    expect(sql.match(/'action','apply_decision'/g)).toHaveLength(2);
    expect(sql.match(/'result','reviewed'/g)).toHaveLength(2);
    expect(sql.match(/'result','applied'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/'result','complete'/);
  });

  it("fully validates a marker-matching reused draft", () => {
    expect(sql).toContain("EXTERNAL_PAYMENT_WORKFLOW_STEP_STRUCTURE_MISMATCH");
    expect(sql).toContain("EXTERNAL_PAYMENT_WORKFLOW_TRANSITION_STRUCTURE_MISMATCH");
    expect(sql).toContain("jsonb_array_length(v_service.steps)");
    expect(sql).toContain("jsonb_array_length(v_service.transitions)");
    expect(sql).toContain("ts.step_key IS NOT DISTINCT FROM expected.value ->> 'to'");
    expect(sql).toContain("s.can_skip IS DISTINCT FROM false");
    expect(sql).toContain("s.produces_document IS DISTINCT FROM false");
    expect(sql).toContain("s.config ->> 'payment_policy' IS NOT NULL");
  });

  it("contains no portal financial ledger vocabulary", () => {
    for (const forbidden of [
      "fee_type.code",
      "fee_type_id",
      "amount",
      "currency",
      "invoice",
      "gateway",
      "transaction_id",
      "internal_balance",
    ]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("keeps final chance limited to the final exam chance", () => {
    expect(sql).toContain("فرصة نهائية للاختبار");
    expect(sql).toContain("تطبيق فرصة الاختبار النهائية");
  });
});
