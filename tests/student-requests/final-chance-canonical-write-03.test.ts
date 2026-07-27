import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "docs", "migration-drafts", "FINAL-CHANCE-CANONICAL-WRITE-03.sql"),
  "utf8",
);

describe("final chance canonical write draft 3/3", () => {
  it("is source-only and never rewrites historical data", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(sql).toContain("no historical rewrite or backfill");
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|DROP)\s+public\./i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("accepts exactly one stored request type: legacy-only or canonical-only", () => {
    expect(sql).toContain("rt.code = 'extra_chance'");
    expect(sql).toContain("rt.code = 'final_chance'");
    expect(sql).toContain("v_legacy_only := (v_extra_chance_type_count = 1 AND v_final_chance_type_count = 0)");
    expect(sql).toContain("v_canonical_only := (v_extra_chance_type_count = 0 AND v_final_chance_type_count = 1)");
    expect(sql).toContain("IF NOT (v_legacy_only OR v_canonical_only) THEN");
    expect(sql).toContain("must resolve to exactly one row across both codes");
    expect(sql).not.toContain("The stored request-type alias remains extra_chance");
    expect(sql).not.toMatch(/UPDATE\s+public\.student_requests/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.request_types/i);
    expect(sql).not.toMatch(/\b(?:INSERT|DELETE)\s+INTO\s+public\.request_types/i);
  });

  it("accepts only final_chance for every new academic write", () => {
    expect(sql).toContain("p_chance_type IS DISTINCT FROM 'final_chance'");
    expect(sql).toContain("FINAL_CHANCE_TYPE_REQUIRED_FOR_NEW_WRITE");
    expect(sql.match(/BEFORE INSERT OR UPDATE OF chance_type/g)).toHaveLength(2);
    expect(sql.match(/CHECK \(chance_type = 'final_chance'\) NOT VALID/g)).toHaveLength(2);
    expect(sql.match(/tgtype = 23/g)).toHaveLength(2);
    expect(sql.match(/tgenabled = 'O'/g)).toHaveLength(2);
    expect(sql).not.toContain("tgenabled <> 'D'");
    expect(sql.match(/bool_and\(a\.attname = 'chance_type'\)/g)).toHaveLength(2);
    expect(sql.match(/pg_get_expr\(c\.conbin, c\.conrelid\)/g)).toHaveLength(2);
    expect(sql).toContain("FINAL_CHANCE_DETAIL_CONSTRAINT_CONTRACT_MISMATCH");
    expect(sql).toContain("FINAL_CHANCE_RECORD_CONSTRAINT_CONTRACT_MISMATCH");
  });

  it("preserves historical values as read-only without validation or backfill", () => {
    expect(sql).toContain("NOT VALID preserves existing historical rows");
    expect(sql).not.toContain("VALIDATE CONSTRAINT");
    for (const legacy of ["additional_chance", "additional_exam", "grade_recovery"]) {
      expect(sql).not.toContain(legacy);
    }
  });

  it("closes direct client writes pending the atomic server boundary", () => {
    expect(sql).toContain(
      "REVOKE ALL PRIVILEGES ON public.extra_chance_details FROM authenticated",
    );
    expect(sql).toContain("GRANT SELECT ON public.extra_chance_details TO authenticated");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("does not mention financial ledger or protected production entities", () => {
    for (const forbidden of [
      "fee_type.code",
      "amount",
      "currency",
      "invoice",
      "gateway",
      "internal_balance",
      "93807768-a281-42de-bfb4-0c0c03786b20",
      "SR-20260713-2DE64041",
      "SR-20260715-FEDCB3E1",
      "USR-2026-000001",
      "student_visible",
    ]) {
      expect(sql.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
