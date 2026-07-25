import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const root = join(import.meta.dir, "..", "..");
const draftPath = join(root, "docs/migration-drafts/B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql");
const migrationPath = join(
  root,
  "supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql",
);
const historicalPath = join(
  root,
  "supabase/migrations/20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql",
);
const preflightPath = join(
  root,
  "docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-PREFLIGHT.sql",
);
const postPath = join(
  root,
  "docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-POST-VERIFIER.sql",
);
const harnessCases = join(root, "scripts/b1-confirm-payment-predecessor-guard-pg17/01-cases.sql");
const harnessRun = join(root, "scripts/b1-confirm-payment-predecessor-guard-pg17/02-run.ps1");
const freezePath = join(root, "docs/B1-FIVE-SERVICES-BACKEND-CONTRACT-FREEZE-01.md");
const promotionMapPath = join(
  root,
  "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json",
);
const manifestPath = join(root, "docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json");

const DRAFT_SHA_LF = "98bcf77cbda492135d19801b9997eced6a4699a6f555bdfda4d739998389b035";
const MIGRATION_SHA_LF = "e4a9f7f3a9a9fe060fdf325a5aa39e8d3437170b71795ce431ca629166622335";

function lfSha256(path: string): string {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("B1 confirm-payment predecessor guard 01", () => {
  const draft = readFileSync(draftPath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");
  const historical = readFileSync(historicalPath, "utf8");

  it("pins draft/migration LF SHAs and promotion map order 19", () => {
    expect(lfSha256(draftPath)).toBe(DRAFT_SHA_LF);
    expect(lfSha256(migrationPath)).toBe(MIGRATION_SHA_LF);
    const map = JSON.parse(readFileSync(promotionMapPath, "utf8")) as Array<{
      order: number;
      draft: string;
      migration: string;
      draft_sha_lf: string;
      migration_sha_lf: string;
    }>;
    const entry = map.find((x) => x.order === 19);
    expect(entry?.draft).toBe("B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql");
    expect(entry?.migration).toBe(
      "supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql",
    );
    expect(entry?.draft_sha_lf).toBe(DRAFT_SHA_LF);
    expect(entry?.migration_sha_lf).toBe(MIGRATION_SHA_LF);
  });

  it("is forward-only CREATE OR REPLACE and does not edit the historical migration", () => {
    expect(draft).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(migration).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(migration).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
    expect(draft).toContain(
      "CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.record_external_university_payment_confirmation(",
    );
    expect(historical).not.toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(historical).toContain("record_external_university_payment_confirmation");
  });

  it("keeps the simplified two-arg revenue contract (no financial payload)", () => {
    for (const sql of [draft, migration]) {
      expect(sql).toContain("p_step_id uuid");
      expect(sql).toContain("p_note text DEFAULT NULL");
      expect(sql).not.toContain("p_status");
      expect(sql).not.toContain("payment_not_confirmed");
      for (const forbidden of [
        "fee_type_id",
        "amount numeric",
        "currency text",
        "invoice",
        "gateway",
        "payment_reference",
        "internal_balance",
      ]) {
        expect(sql.toLowerCase()).not.toContain(forbidden);
      }
      expect(sql).toContain("completed_by = v_uid");
      expect(sql).toContain("completed_at = now()");
      expect(sql).toContain("'department_transfer','transfer','final_chance','extra_chance'");
    }
  });

  it("places predecessor check after assignee+binding and before transition/mutation", () => {
    for (const sql of [draft, migration]) {
      const assigneePos = sql.indexOf("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
      const bindingPos = sql.indexOf("EXACT_FINANCE_PROCESSING_BINDING_REQUIRED");
      const predPos = sql.indexOf("B1_PREDECESSOR_INCOMPLETE");
      const transitionPos = sql.indexOf("EXACTLY_ONE_PAYMENT_CONFIRMED_TRANSITION_REQUIRED");
      const updatePos = sql.indexOf("UPDATE public.student_request_workflow_steps");
      const insertPos = sql.indexOf("INSERT INTO public.student_request_workflow_events");
      expect(assigneePos).toBeGreaterThan(0);
      expect(bindingPos).toBeGreaterThan(assigneePos);
      expect(predPos).toBeGreaterThan(bindingPos);
      expect(transitionPos).toBeGreaterThan(predPos);
      expect(updatePos).toBeGreaterThan(predPos);
      expect(insertPos).toBeGreaterThan(predPos);
      expect(sql).toContain("prior.step_order < v_step.step_order");
      expect(sql).toContain("prior.status NOT IN ('completed','skipped')");
      expect(sql).toContain("RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'");
    }
  });

  it("preserves exact finance assignee grants and denies anon/PUBLIC", () => {
    for (const sql of [draft, migration]) {
      expect(sql).toContain("EXACTLY_ONE_DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
      expect(sql).toContain("EXACT_FINANCE_PROCESSING_BINDING_REQUIRED");
      expect(sql).toContain(
        "REVOKE ALL ON FUNCTION public.record_external_university_payment_confirmation(uuid, text)",
      );
      expect(sql).toContain("FROM PUBLIC, anon");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid, text)",
      );
      expect(sql).toContain("TO authenticated");
      expect(sql).not.toContain("can_current_user_act_on_step");
      expect(sql).not.toContain("has_any_role");
    }
  });

  it("does not touch enrollment_certificate, student_visible, or workflow activation", () => {
    for (const sql of [draft, migration]) {
      expect(sql).not.toContain("enrollment_certificate");
      expect(sql).not.toContain("student_visible");
      expect(sql).not.toMatch(/UPDATE\s+public\.request_types/i);
      expect(sql).not.toMatch(/UPDATE\s+public\.request_type_workflows/i);
    }
  });

  it("ships READ-ONLY preflight/post-verifier companions", () => {
    const pre = readFileSync(preflightPath, "utf8");
    const post = readFileSync(postPath, "utf8");
    for (const sql of [pre, post]) {
      expect(sql).toContain("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY");
      expect(sql).toContain("ROLLBACK");
      expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
      expect(sql).not.toMatch(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    }
    expect(pre).toContain("predecessor guard not installed yet");
    expect(pre).toContain("NOT LIKE '%B1_PREDECESSOR_INCOMPLETE%'");
    expect(post).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(post).toContain("predecessor check after finance binding and before mutation");
  });

  it("freezes B1_PREDECESSOR_INCOMPLETE on the payment confirmation RPC", () => {
    const freeze = readFileSync(freezePath, "utf8");
    const section = sliceBetween(
      freeze,
      "### `record_external_university_payment_confirmation(uuid, text DEFAULT NULL) → jsonb`",
      "### Secure attachment RPCs",
    );
    expect(section).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(section).toContain("Forward-only fix");
    expect(section).toContain("20260725120000_b1_confirm_payment_predecessor_guard_01.sql");
  });

  it("registers as manifest sequence_order 20 after ACL cutover, before secure reads and gate 22", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      global_policies: { activation_gate: string };
      migrations: Array<{
        canonical_id: string;
        sequence_order: number;
        sequence_predecessor: string;
        sha256: string;
        filename: string;
      }>;
    };
    // Promotion-map order 19 and manifest sequence_order 20 precede secure reads and gate 22.
    expect(manifest.global_policies.activation_gate).toMatch(/gate 22/);
    expect(manifest.global_policies.activation_gate).toMatch(/sequence_order 20/);
    expect(manifest.global_policies.activation_gate).toMatch(/promotion-map order 19/);
    const entry = manifest.migrations.find(
      (m) => m.canonical_id === "B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-19",
    );
    expect(entry?.sequence_order).toBe(20);
    expect(entry?.sequence_predecessor).toBe("B1-DETAIL-ACL-CUTOVER-18");
    expect(entry?.sha256).toBe(DRAFT_SHA_LF);
    expect(entry?.filename).toBe("B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql");
    const acl = manifest.migrations.find((m) => m.canonical_id === "B1-DETAIL-ACL-CUTOVER-18");
    expect(acl?.sequence_order).toBe(19);
  });

  it("ships an isolated PostgreSQL 17 behavioral harness for both paid services", () => {
    expect(existsSync(harnessCases)).toBe(true);
    expect(existsSync(harnessRun)).toBe(true);
    const cases = readFileSync(harnessCases, "utf8");
    const runner = readFileSync(harnessRun, "utf8");
    expect(runner).toContain("postgres:17");
    expect(runner).toContain("20260725120000_b1_confirm_payment_predecessor_guard_01.sql");
    expect(runner).toContain("02-reproduce-bypass.sql");
    expect(runner).toContain("EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql");
    expect(cases).toContain("final_chance");
    expect(cases).toContain("department_transfer");
    for (const status of ["pending", "active", "returned", "rejected"]) {
      expect(cases).toContain(status);
    }
    expect(cases).toContain("B1_PREDECESSOR_INCOMPLETE");
    expect(cases).toContain("DIRECT_PAYMENT_ASSIGNEE_REQUIRED");
    expect(cases).toContain("EXACT_FINANCE_PROCESSING_BINDING_REQUIRED");
    expect(cases).toContain("zero_mutation");
    expect(cases).toContain("skipped");
    expect(cases).toContain("ROLLBACK");
  });
});
