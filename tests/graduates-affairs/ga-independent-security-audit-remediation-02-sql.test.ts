import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural contract for the forward-only remediation migration
// 20260811230000_ga_independent_security_audit_remediation_02.sql.

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811230000_ga_independent_security_audit_remediation_02.sql",
  ),
  "utf8",
);

const code = sql.replace(/--.*$/gm, "");

function bodyOf(name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("remediation migration header and safety", () => {
  test("is source-only and forward-only", () => {
    expect(sql).toContain("FORWARD-ONLY REMEDIATION MIGRATION");
    expect(sql).toContain("SOURCE ONLY");
    expect(sql).toContain("DO NOT APPLY TO PRODUCTION");
    expect(code).not.toMatch(/supabase\s+db\s+push|supabase\s+migration\s+up/i);
    expect(code).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(code).not.toMatch(/DROP\s+(?:TRIGGER|TABLE|FUNCTION|POLICY)\s/i);
  });

  test("pins search_path and uses SECURITY DEFINER for every function", () => {
    const functions = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    const definer = sql.match(/SECURITY DEFINER/g) ?? [];
    const searchPath = sql.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(functions.length).toBeGreaterThan(0);
    expect(definer).toHaveLength(functions.length);
    expect(searchPath).toHaveLength(functions.length);
  });

  test("does not grant broad table privileges or EXECUTE to anon/public", () => {
    expect(code).not.toMatch(/GRANT\s+(?!EXECUTE\b)\w/i);
    expect(code).not.toMatch(/GRANT\s+.*\s+TO\s+anon\b/i);
    expect(code).not.toMatch(/GRANT\s+.*\s+TO\s+PUBLIC\b/i);
  });

  test("revokes the new internal validator from client roles", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.graduate_validate_survey_answers\(jsonb, jsonb\) FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe("H-02 event registration audience boundary", () => {
  test("graduate_register_for_event uses the canonical audience predicate", () => {
    const body = bodyOf("graduate_register_for_event");
    expect(body).toContain("graduate_audience_matches(");
    expect(body).toContain("GRADUATE_EVENT_AUDIENCE_DENIED");
  });
});

describe("M-04 survey answer server validation", () => {
  test("graduate_validate_survey_answers is declared and fail-closed", () => {
    const body = bodyOf("graduate_validate_survey_answers");
    expect(body).toContain("GRADUATE_SURVEY_REQUIRED_MISSING:");
    expect(body).toContain("GRADUATE_SURVEY_UNKNOWN_KEY:");
    expect(body).toContain("GRADUATE_SURVEY_WRONG_TYPE:");
    expect(body).toContain("GRADUATE_SURVEY_INVALID_OPTION:");
  });

  test("graduate_submit_survey_response calls the canonical validator", () => {
    const body = bodyOf("graduate_submit_survey_response");
    expect(body).toContain("graduate_validate_survey_answers(");
  });
});

describe("M-05 ambiguous approved record self context", () => {
  test("graduate_affairs_resolve_self_context counts approved records", () => {
    const body = bodyOf("graduate_affairs_resolve_self_context");
    expect(body).toContain("count(*)");
    expect(body).toContain("v_record_count = 1");
    expect(body).toContain("'owns_graduate_record', v_record_count = 1");
  });
});
