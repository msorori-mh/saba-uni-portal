import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL text contract for the graduates-affairs authorization draft (bundle 04).
// The executable behavior matrix lives in
// tests/graduates-affairs/graduates-affairs-authorization-04.pg-verify.sql;
// this file pins the draft's structural guarantees.

const sql = readFileSync(
  join(process.cwd(), "docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql"),
  "utf8",
);

// Code view with line comments stripped (column names that may legitimately
// appear only inside write-path INSERTs are checked against this view).
const code = sql.replace(/--.*$/gm, "");

function bodyOf(name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const SELF_RPCS = [
  "graduate_update_own_profile",
  "graduate_grant_consent",
  "graduate_withdraw_consent",
  "graduate_add_contact_point",
  "graduate_revoke_contact_point",
  "graduate_my_contact_points",
  "graduate_report_employment",
  "graduate_submit_survey_response",
  "graduate_withdraw_survey_response",
  "graduate_register_for_event",
  "graduate_cancel_event_registration",
  "graduate_list_visible_opportunities",
  "graduate_list_visible_events",
];

const STAFF_RPCS = [
  "graduate_affairs_get_graduate_file",
  "graduate_affairs_search_records",
  "graduate_affairs_create_followup",
  "graduate_affairs_transition_followup",
  "graduate_affairs_moderate_opportunity",
  "graduate_affairs_set_employer_verification",
  "graduate_affairs_cohort_employment_report",
];

const HELPERS = [
  "graduate_affairs_audit",
  "graduate_affairs_is_manager",
  "graduate_affairs_is_specialist",
  "graduate_affairs_specialist_department_ids",
  "graduate_is_self",
  "graduate_affairs_can_access_record",
  "graduate_audience_matches",
  "graduate_self_matches_audience",
];

// Helpers referenced by RLS policy expressions must stay executable by
// authenticated (policy expressions run with the querying user's privileges).
const POLICY_HELPERS = [
  "graduate_is_self",
  "graduate_audience_matches",
  "graduate_self_matches_audience",
];
const INTERNAL_HELPERS = HELPERS.filter((name) => !POLICY_HELPERS.includes(name));

describe("authorization draft header and chain", () => {
  test("is a source-only draft chained after foundation and completion", () => {
    expect(sql).toContain("DRAFT ONLY — SOURCE REVIEW ARTIFACT — DO NOT APPLY");
    expect(sql).toContain("GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql");
    expect(sql).toContain("GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql");
    expect(sql).toContain("graduates-affairs-authorization-04.pg-verify.sql");
  });

  test("never activates production or loosens earlier drafts", () => {
    expect(sql).not.toMatch(
      /supabase\s+db\s+push|supabase\s+migration\s+up|preview_ui--publish/i,
    );
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/DROP\s+(?:TRIGGER|TABLE|FUNCTION|POLICY)\s/i);
    // RLS was enabled by the earlier drafts; this bundle adds policies only.
    expect(code).not.toContain("ENABLE ROW LEVEL SECURITY");
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
  });
});

describe("function inventory and privileges", () => {
  test("declares all 20 RPCs and the internal helpers", () => {
    for (const name of [...SELF_RPCS, ...STAFF_RPCS, ...HELPERS]) {
      expect(sql).toContain(`FUNCTION public.${name}(`);
    }
  });

  test("every function is SECURITY DEFINER with a pinned search_path", () => {
    const functions = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    const definer = sql.match(/SECURITY DEFINER/g) ?? [];
    const searchPath = sql.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(functions).toHaveLength(28);
    expect(definer).toHaveLength(functions.length);
    expect(searchPath).toHaveLength(functions.length);
  });

  test("internal helpers are revoked from every client role", () => {
    for (const name of INTERNAL_HELPERS) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`),
      );
    }
  });

  test("policy-referenced helpers are executable by authenticated only", () => {
    for (const name of POLICY_HELPERS) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`),
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`),
      );
    }
  });

  test("every RPC is revoked from PUBLIC and anon before the authenticated grant", () => {
    for (const name of [...SELF_RPCS, ...STAFF_RPCS]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`),
      );
    }
  });

  test("exactly the 20 RPCs plus the three policy helpers are granted EXECUTE", () => {
    const grants = sql.match(/GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO authenticated/g) ?? [];
    expect(grants).toHaveLength(23);
    for (const name of [...SELF_RPCS, ...STAFF_RPCS]) {
      expect(grants.some((grant) => grant.includes(`public.${name}(`))).toBe(true);
    }
    // No table privileges are granted anywhere in the bundle.
    expect(code).not.toMatch(/GRANT\s+(?!EXECUTE\b)\w/i);
    expect(code).not.toMatch(/TO\s+anon\b/i);
  });
});

describe("staff RPCs audit every call", () => {
  for (const name of STAFF_RPCS) {
    test(`${name} writes an audit event`, () => {
      expect(bodyOf(name)).toContain("graduate_affairs_audit(");
    });
  }

  test("mutating self-service RPCs write audit events", () => {
    const audited = SELF_RPCS.filter(
      (name) =>
        ![
          "graduate_my_contact_points",
          "graduate_list_visible_opportunities",
          "graduate_list_visible_events",
        ].includes(name),
    );
    for (const name of audited) {
      expect(bodyOf(name)).toContain("graduate_affairs_audit(");
    }
  });
});

describe("protected columns never leave the schema", () => {
  test("notes_protected appears only in the header comment", () => {
    expect(code).not.toContain("notes_protected");
  });

  test("protected_value appears only in the self-add write path", () => {
    const occurrences = code.match(/protected_value/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(bodyOf("graduate_add_contact_point")).toContain("protected_value");
  });

  test("reader projections never select protected values", () => {
    for (const name of [
      "graduate_my_contact_points",
      "graduate_affairs_get_graduate_file",
      "graduate_affairs_search_records",
      "graduate_list_visible_opportunities",
      "graduate_list_visible_events",
    ]) {
      expect(bodyOf(name)).not.toContain("protected_value");
      expect(bodyOf(name)).not.toContain("notes_protected");
    }
  });

  test("contact point audit payload carries metadata only", () => {
    const body = bodyOf("graduate_add_contact_point");
    const auditCall = body.slice(body.indexOf("graduate_affairs_audit("));
    expect(auditCall).not.toContain("p_value");
  });
});

describe("RLS policy surface", () => {
  const POLICIES = [
    ["graduate_profiles_select_self", "graduate_profiles"],
    ["graduate_consents_select_self", "graduate_consents"],
    ["graduate_survey_responses_select_self", "graduate_survey_responses"],
    ["graduate_event_registrations_select_self", "graduate_event_registrations"],
    ["graduate_employment_events_select_self", "graduate_employment_events"],
    ["graduate_opportunities_select_audience", "graduate_opportunities"],
    ["graduate_events_select_audience", "graduate_events"],
  ];

  test("exactly seven SELECT policies exist, on the intended tables", () => {
    const created = code.match(/CREATE POLICY/g) ?? [];
    expect(created).toHaveLength(7);
    for (const [policy, table] of POLICIES) {
      expect(code).toContain(`CREATE POLICY ${policy} ON public.${table}`);
      expect(code).toMatch(
        new RegExp(`CREATE POLICY ${policy}[\\s\\S]*?FOR SELECT TO authenticated`),
      );
    }
  });

  test("protected tables get no policies (default deny stays)", () => {
    for (const table of [
      "graduate_official_decisions",
      "graduate_records",
      "graduate_contact_points",
      "graduate_employers",
      "graduate_surveys",
      "graduate_survey_versions",
      "graduate_domain_events",
      "graduate_followups",
      "graduate_communication_events",
      "graduate_account_continuity_policies",
    ]) {
      expect(code).not.toContain(`CREATE POLICY graduate_${table}`);
      expect(code).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\b`));
    }
  });

  test("no INSERT/UPDATE/DELETE policies: writes are RPC-only", () => {
    expect(code).not.toMatch(/CREATE POLICY[\s\S]*?FOR\s+(INSERT|UPDATE|DELETE|ALL)\b/);
  });
});

describe("actor model has no bypass", () => {
  test("no app_role / has_any_role based authorization", () => {
    expect(code).not.toMatch(/app_role|has_any_role|has_role\s*\(/i);
  });

  test("staff checks route through the assignment helpers", () => {
    for (const name of STAFF_RPCS) {
      const body = bodyOf(name);
      expect(
        body.includes("graduate_affairs_is_manager()") ||
          body.includes("graduate_affairs_can_access_record("),
      ).toBe(true);
    }
  });

  test("audience matching is fail-closed on non-object scopes", () => {
    const body = bodyOf("graduate_audience_matches");
    expect(body).toContain("jsonb_typeof(p_scope) IS DISTINCT FROM 'object'");
    expect(body).toContain("RETURN false");
  });
});
