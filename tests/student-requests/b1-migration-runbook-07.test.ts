import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const doc=readFileSync(join(process.cwd(),"docs","B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md"),"utf8");

describe("B1 migration promotion and application runbook 07",()=>{
  it("keeps source contracts and protected notification correction out of the apply sequence",()=>{
    expect(doc).toContain("Files that must never be applied");
    for(const file of ["REQUEST-B1-SHARED-FOUNDATION-SOURCE-01.sql","SUSPENSION-ABSENCE-SOURCE-01.sql","FILE-WITHDRAWAL-SOURCE-01.sql","ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION.sql"])
      expect(doc).toContain(`\`${file}\``);
  });
  it("orders every executable draft and preserves the fail-closed missing gates",()=>{
    for(const gate of ["Free-service workflows","MISSING RELEASE EVIDENCE","ACL cutover","SEPARATE APPROVAL"])
      expect(doc).toContain(gate);
    expect(doc).toContain("B1-FREE-SERVICE-WORKFLOWS-08.sql");
    expect(doc).toContain("1e8b6437ce71aab4c60ad122dd1a405841d1dcca1fda09ab45df1ca4907db44c");
    expect(doc).toContain("REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql");
    expect(doc).toContain("55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383");
    expect(doc.indexOf("REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql")).toBeLessThan(doc.indexOf("REQUEST-B1-SERVICE-DETAILS-05A.sql"));
    expect(doc.indexOf("Runtime release containing atomic caller")).toBeLessThan(doc.indexOf("STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql"));
    expect(doc.indexOf("Free-service workflows")).toBeLessThan(doc.indexOf("EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql"));
  });
  it("allows only one dry-run-proven migration and forbids unsafe history shortcuts",()=>{
    expect(doc).toContain("supabase db push --linked --dry-run");
    expect(doc).toContain("git cat-file blob");
    expect(doc).toContain("exactly one expected timestamp");
    expect(doc).toContain("two SHA checks match the separately approved SHA");
    for(const unsafe of ["--include-all","migration repair","direct history writes","raw `psql -f` substitute"])
      expect(doc).toContain(unsafe);
  });
  it("retains payment, visibility, protected-id and partial-apply controls",()=>{
    expect(doc).toContain("External university confirmation");
    expect(doc).toContain("student_visible");
    expect(doc).toContain("On error or partial state, stop the chain");
    for(const protectedId of ["93807768-a281-42de-bfb4-0c0c03786b20","SR-20260713-2DE64041","SR-20260715-FEDCB3E1","USR-2026-000001"])
      expect(doc).toContain(protectedId);
    expect(doc).toContain("prohibit historical notification backfill");
    for(const forbiddenFinancial of ["fee_type.code","amount","currency","invoice","gateway transaction","internal balance"])
      expect(doc).toContain(forbiddenFinancial);
    expect(doc).toContain("Final exam chance only");
  });
});
