import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const report = readFileSync(
  join(root, "docs", "B1-RELEASE-AND-FIRST-SERVICE-PREFLIGHT-PACK-01-REPORT.md"),
  "utf8",
);
const normalized = report.replace(/\s+/g, " ");
const drafts = join(root, "docs", "migration-drafts");

const ordered = [
  [
    "REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql",
    "893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357",
  ],
  [
    "REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
    "3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab",
  ],
  [
    "STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
    "0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0",
  ],
  [
    "REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
    "e5b5ee1cba7a39864ff07b3d95daed31b1f1a513613566b052ca3f62661a8edf",
  ],
  [
    "REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql",
    "a92505d71ba6e02d29b4993d10da8ff8e2f91e5fa62549a6a7efe74c1dc8b58a",
  ],
  [
    "EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql",
    "da4eadb7de0a4fad8f3d5839a6b4719031a47b1b345652c5eae4ebd6fc872e4b",
  ],
  [
    "STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql",
    "bf95bb4bf87e5a8feea2dbba90bf76e56eed4c7e51e093acb7217d1fa3114f20",
  ],
  [
    "REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql",
    "529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c",
  ],
  [
    "REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql",
    "e2d1cbe1ff09749583f66bf7e32a3f7570bf190ea77dffe113910bb397ba4205",
  ],
  [
    "REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql",
    "1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe",
  ],
  [
    "REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql",
    "1a2bba070d81b072faf61fe87b62fb8fe114b3fe3611ecb45ba18173cebf9ee9",
  ],
  [
    "REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql",
    "d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284",
  ],
  [
    "FINAL-CHANCE-CANONICAL-WRITE-03.sql",
    "9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704",
  ],
  [
    "REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql",
    "85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495",
  ],
  [
    "REQUEST-B1-SERVICE-DETAILS-05A.sql",
    "d8eec185033818b6612d6ada94e6be95264ed34ac4647fe1f712bb385674600c",
  ],
  [
    "B1-FREE-SERVICE-WORKFLOWS-08.sql",
    "1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c",
  ],
  [
    "EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql",
    "64e3436cda5e485fdea5144bb0668eec62b5098c62e444342d18411ea7cd8250",
  ],
  [
    "REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql",
    "55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383",
  ],
] as const;

describe("B1 release and enrollment-suspension preflight pack", () => {
  test("pins candidate source without claiming deployment", () => {
    expect(report).toContain("b50979a8d8ccf07d0c8339f31e589441e44bd8bf");
    expect(report).toContain("DEPLOYED_SHA=UNKNOWN");
    expect(report).toContain("expected source candidate, not a claimed deployed SHA");
    expect(report).toContain("HOLD_RELEASE_NOT_DEPLOYED");
  });

  test("pins exact coordinated order and current LF hashes", () => {
    expect(ordered).toHaveLength(18);
    let cursor = -1;
    for (const [file, expected] of ordered) {
      const next = report.indexOf(`\`${file}\``, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
      const bytes = readFileSync(join(drafts, file), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(expected);
      expect(report).toContain(expected);
    }
  });

  test("proves all five services remain fail closed before migrations", () => {
    for (const service of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ])
      expect(report).toContain(service);
    expect(report).toContain("runtimeAvailable:false");
    expect(report).toContain("all five services stay fail-closed");
    expect(report).toContain("HOLD_RUNTIME_RELEASE_EVIDENCE_MISSING");
  });

  test("contains read-only before/after, smoke and rollback contracts", () => {
    for (const token of [
      "Read-only before queries",
      "Read-only after queries",
      "Pre-migration release smoke",
      "Release rollback plan",
      "partial apply",
      "protected records remain present",
    ])
      expect(normalized).toContain(token);
    expect(report).toContain("public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)");
    expect(report).toContain("none of the 18 promoted versions exists");
  });

  test("documents but never authorizes or claims execution", () => {
    expect(report).toContain("Future apply command envelope — DOCUMENTED, NEVER EXECUTED");
    expect(report).toContain("supabase db push --linked --dry-run");
    expect(report).toContain("This command was not run");
    expect(report).toContain("HOLD_MIGRATIONS_NOT_AUTHORIZED");
    expect(report).toContain("Production impact: zero");
  });

  test("keeps first service free and four siblings inactive", () => {
    expect(report).toContain("activate only its three-step free workflow");
    expect(report).toContain("other four B1 services remain inactive");
    expect(report).toContain("creates no payment confirmation");
    expect(report).toContain("`fee_type.code`");
  });

  test("does not touch deferred service scope", () => {
    expect(report).toContain("six deferred services were not touched");
    expect(report).not.toMatch(
      /grade_statement_non_graduate|october_exam_entry_form|replacement_student_card|academic_record|graduation_certificate/,
    );
  });
});
