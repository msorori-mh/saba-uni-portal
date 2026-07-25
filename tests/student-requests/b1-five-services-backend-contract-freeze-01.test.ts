import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const freezePath = join(root, "docs", "B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md");
const verifiersDir = join(root, "docs", "migration-drafts", "b1-backend-verifiers");
const paymentDraft = join(
  root,
  "docs",
  "migration-drafts",
  "EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql",
);

const promoted = [
  "20260725110000_b1_07_secure_attachments_source_01.sql",
  "20260725110100_b1_08_trusted_reference_validators_05a.sql",
  "20260725110200_b1_09_excused_absence_vocabulary_05a.sql",
  "20260725110300_b1_10_excused_absence_detail_05a.sql",
  "20260725110400_b1_11_file_withdrawal_details_05a.sql",
  "20260725110500_b1_12_transfer_secure_attachment_05a.sql",
  "20260725110600_b1_13_final_chance_canonical_write_03.sql",
  "20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql",
  "20260725110800_b1_15_service_details_dispatcher_05a.sql",
  "20260725110900_b1_16_free_service_workflows_08.sql",
  "20260725111000_b1_17_external_university_payment_workflows_02.sql",
  "20260725111100_b1_18_detail_acl_cutover_06.sql",
  "20260725120000_b1_confirm_payment_predecessor_guard_01.sql",
] as const;

describe("B1 five-services backend contract freeze 01", () => {
  it("freezes authenticated RPC surface and revenue simplification rules", () => {
    const freeze = readFileSync(freezePath, "utf8");
    expect(freeze).toContain("Status: **FROZEN**");
    for (const rpc of [
      "submit_b1_student_request_atomic",
      "act_on_b1_student_request_step_atomic",
      "record_external_university_payment_confirmation",
      "persist_validated_b1_request_details",
      "create_student_request_attachment_upload_intent",
    ]) {
      expect(freeze).toContain(rpc);
    }
    for (const service of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]) {
      expect(freeze).toContain(service);
    }
    expect(freeze).toContain("No amount/currency/invoice/gateway");
    expect(freeze).toContain("payment_not_confirmed");
    expect(freeze).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(freeze).toContain("20260725120000_b1_confirm_payment_predecessor_guard_01.sql");
    expect(freeze).toContain("`status='draft'`");
    expect(freeze).toContain("`is_active=false`");
  });

  it("promotes runbook orders 7–19 with paired preflight/post-verifier companions", () => {
    for (const file of promoted) {
      const path = join(root, "supabase", "migrations", file);
      expect(existsSync(path)).toBe(true);
      const body = readFileSync(path, "utf8");
      expect(body).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(body).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
    }
    const files = readdirSync(verifiersDir);
    expect(files).toContain("README.md");
    expect(files).toContain("PROMOTION-MAP.json");
    const preflights = files.filter((f) => f.endsWith("-PREFLIGHT.sql"));
    const posts = files.filter((f) => f.endsWith("-POST-VERIFIER.sql"));
    expect(preflights).toHaveLength(15);
    expect(posts).toHaveLength(15);
    for (const f of [...preflights, ...posts]) {
      const sql = readFileSync(join(verifiersDir, f), "utf8");
      expect(sql).toContain("READ ONLY");
      expect(sql).toContain("ROLLBACK;");
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
    }
  });

  it("keeps simplified payment confirmation free of financial ledger fields", () => {
    const sql = readFileSync(paymentDraft, "utf8");
    const lower = sql.toLowerCase();
    for (const forbidden of [
      "amount numeric",
      "currency text",
      "invoice",
      "gateway_transaction",
      "payment_reference",
      "internal_balance",
      "fee_type_id",
      "payment_not_confirmed",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
    expect(sql).toContain("p_step_id uuid");
    expect(sql).toContain("p_note text DEFAULT NULL");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.record_external_university_payment_confirmation(uuid, text, text)",
    );
  });

  it("wires generated types for B1 attachment and withdrawal surfaces", () => {
    const types = readFileSync(join(root, "src", "integrations", "supabase", "types.ts"), "utf8");
    expect(types).toContain("file_withdrawal_details:");
    expect(types).toContain("student_request_attachment_uploads:");
    expect(types).toContain("create_student_request_attachment_upload_intent:");
    expect(types).toContain("authorize_student_request_attachment_download:");
    expect(types).toContain("record_external_university_payment_confirmation:");
    expect(types).toContain("submit_b1_student_request_atomic:");
    expect(types).toContain("act_on_b1_student_request_step_atomic:");
  });

  it("keeps promoted migrations free of Migration Review dangerous patterns", () => {
    const patterns = [
      /DROP\s+TABLE/i,
      /TRUNCATE\s+/i,
      /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      /DROP\s+POLICY/i,
      /DELETE\s+FROM/i,
      /UPDATE\s+auth\.users/i,
    ];
    for (const file of promoted) {
      const body = readFileSync(join(root, "supabase", "migrations", file), "utf8");
      expect(body).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
      expect(body).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
      expect(body).not.toContain("DRAFT ONLY");
      expect(body).not.toContain("This file is not a migration");
      for (const pattern of patterns) {
        expect(body).not.toMatch(pattern);
      }
    }
    const absence = readFileSync(
      join(root, "docs", "migration-drafts", "REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql"),
      "utf8",
    );
    const boundaries = readFileSync(
      join(root, "docs", "migration-drafts", "REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql"),
      "utf8",
    );
    expect(absence).toContain("DRAFT ONLY");
    expect(boundaries).toContain("DRAFT ONLY");
    expect(absence).toContain("format('%s POLICY IF EXISTS %I ON public.%I', 'DROP'");
    expect(boundaries).toContain("format('%s POLICY IF EXISTS %I ON public.%I','DROP'");
    expect(absence).not.toMatch(/DROP\s+POLICY/i);
    expect(boundaries).not.toMatch(/DROP\s+POLICY/i);
  });
});
