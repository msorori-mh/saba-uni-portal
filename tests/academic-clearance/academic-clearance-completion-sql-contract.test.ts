import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../../docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql", import.meta.url),
  "utf8",
);

describe("academic clearance completion SQL draft", () => {
  it("is a source-only forward-only draft on top of the foundation", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY");
    expect(sql).toContain("SOURCE-ONLY DRAFT");
    expect(sql).toContain("DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql");
    // Forward-only: foundation enums/tables are extended or replaced, never recreated.
    expect(sql).not.toContain("create type public.academic_clearance_status");
    expect(sql).not.toContain("create type public.course_equivalency_decision");
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("drop function");
    expect(sql).not.toContain("drop type");
  });

  it("completes the seven clearance statuses with returned and terminal rejected", () => {
    expect(sql).toContain(
      "alter type public.academic_clearance_status add value if not exists 'returned'",
    );
    expect(sql).toContain("c.status in ('draft','department_review','returned')");
    expect(sql).toContain("v_case.status not in ('draft','department_review','returned')");
    expect(sql).toContain("c.status in ('academic_affairs_review','approved','rejected')");
    expect(sql).toContain("REJECTED_CLEARANCE_IMMUTABLE");
    expect(sql).toContain("v_status in ('approved','superseded','rejected')");
  });

  it("adopts the resolved seven-value comparison vocabulary", () => {
    expect(sql).toContain(
      "alter type public.course_equivalency_decision add value if not exists 'supporting_requirement'",
    );
    expect(sql).toContain(
      "'equivalent','partially_equivalent','general_requirement','supporting_requirement'",
    );
  });

  it("adds reviewer return/reject RPCs with locking, provenance and ACL posture", () => {
    expect(sql).toContain("create function public.return_academic_clearance_to_department");
    expect(sql).toContain("create function public.reject_academic_clearance");
    expect(sql).toContain("for update");
    expect(sql).toContain("ACADEMIC_CLEARANCE_FORBIDDEN");
    expect(sql).toContain("ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE");
    expect(sql).toContain("'academic_affairs','returned'");
    expect(sql).toContain("'academic_affairs','rejected'");
    expect(sql).toContain("'returned_to_department'");
    expect(sql).toContain(
      "revoke all on function public.return_academic_clearance_to_department(uuid,bigint,text) from public,anon",
    );
    expect(sql).toContain(
      "revoke all on function public.reject_academic_clearance(uuid,bigint,text) from public,anon",
    );
    expect(sql).toContain(
      "grant execute on function public.return_academic_clearance_to_department(uuid,bigint,text) to authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.reject_academic_clearance(uuid,bigint,text) to authenticated",
    );
  });

  it("keeps original grades read-only and counts returned work in reporting", () => {
    expect(sql).not.toMatch(/update\s+(public\.)?student_grades/i);
    expect(sql).not.toMatch(/insert\s+into\s+(public\.)?student_grades/i);
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?student_grades/i);
    expect(sql).toContain("create or replace view public.academic_clearance_reporting");
    expect(sql).toContain("'draft','department_review','academic_affairs_review','returned'");
    expect(sql).toContain("create or replace view public.academic_clearance_course_outcomes");
    expect(sql).toContain(
      "'equivalent','partially_equivalent','supporting_requirement','not_equivalent'",
    );
  });
});
