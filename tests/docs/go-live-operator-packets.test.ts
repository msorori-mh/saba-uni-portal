import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const GO_LIVE_DIR = join(process.cwd(), "docs", "go-live");
const OPERATOR_PACKETS_DIR = join(GO_LIVE_DIR, "operator-packets");
const REVIEWS_DIR = join(process.cwd(), "docs", "reviews");

describe("Go-Live Operator Packets & Demo Script Verification", () => {
  test("Section A: LOVABLE-FINAL-PUBLISH-AND-SHA-PROOF.txt exists and contains proof mechanisms", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "LOVABLE-FINAL-PUBLISH-AND-SHA-PROOF.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/version.json");
    expect(content).toContain('meta[name="build-sha"]');
    expect(content).toContain("STALE BUILD");
    expect(content).toContain("WRONG_ENVIRONMENT");
    expect(content).toContain("/admin");
    expect(content).toContain("/student");
    expect(content).toContain("/faculty");
    expect(content).toContain("/staff");
  });

  test("Section B: PRODUCTION-DEMO-ROLE-DATA-RECONCILIATION.txt exists and contains 12 personas & dual-council rules", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-DEMO-ROLE-DATA-RECONCILIATION.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Dean");
    expect(content).toContain("Department Head");
    expect(content).toContain("College Council Chair");
    expect(content).toContain("Department Council Chair");
    expect(content).toContain("College Council Member");
    expect(content).toContain("Council Secretary");
    expect(content).toContain("graduation_project_admin");
    expect(content).toContain("graduates_affairs_manager");
    expect(content).toContain("graduates_affairs_specialist");
    expect(content).toContain("registrar");
    expect(content).toContain("student");
    expect(content).toContain("student_level_4");
    expect(content).toContain("DUAL-COUNCIL");
    expect(content).toContain("CHAIR UNIQUENESS");
    expect(content).toContain("Fingerprint Before");
  });

  test("Section C: All 5 B1 Student Services Operator Packets exist and contain 15-step cycles", () => {
    const services = [
      "PRODUCTION-E2E-ENROLLMENT-SUSPENSION.txt",
      "PRODUCTION-E2E-EXCUSED-ABSENCE.txt",
      "PRODUCTION-E2E-DEPARTMENT-TRANSFER.txt",
      "PRODUCTION-E2E-FINAL-CHANCE.txt",
      "PRODUCTION-E2E-FILE-WITHDRAWAL.txt",
    ];

    for (const serviceFile of services) {
      const filePath = join(OPERATOR_PACKETS_DIR, serviceFile);
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("15-STEP EXECUTABLE E2E VERIFICATION CYCLE");
      expect(content).toContain("STUDENT VISIBILITY");
      expect(content).toContain("DRAFT / AUTOSAVE");
      expect(content).toContain("WRONG ROLE REJECTION");
      expect(content).toContain("ACADEMIC EFFECT");
      expect(content).toContain("request_history");
    }
  });

  test("Section D: PRODUCTION-E2E-ENROLLMENT-CERTIFICATE.txt exists and contains 7-step lifecycle & restrictions", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-ENROLLMENT-CERTIFICATE.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("7-STEP EXECUTABLE LIFECYCLE");
    expect(content).toContain("document_issuance");
    expect(content).toContain("SIGNED DOWNLOAD");
    expect(content).toContain("PUBLIC VERIFICATION");
    expect(content).toContain("CANCELLED / REJECTED DOWNLOAD RESTRICTION");
  });

  test("Section E: PRODUCTION-E2E-COUNCILS.txt exists and contains 17-step lifecycle & no admin bypass", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-COUNCILS.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("17-STEP EXECUTABLE LIFECYCLE");
    expect(content).toContain("QUORUM VERIFICATION");
    expect(content).toContain("VOTING ON TOPICS");
    expect(content).toContain("MINUTES LOCK");
    expect(content).toContain("NO ACADEMIC BYPASS");
  });

  test("Section F: PRODUCTION-E2E-GRADUATION-PROJECTS.txt exists and contains Level-4 guard & revisions loop", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-GRADUATION-PROJECTS.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("LEVEL-4 ONLY");
    expect(content).toContain("SUPERVISOR ASSIGNMENT");
    expect(content).toContain("COMMITTEE EVALUATION");
    expect(content).toContain("REVISIONS REQUIRED LOOP");
    expect(content).toContain("READ-ONLY");
  });

  test("Section G: PRODUCTION-E2E-GRADUATE-AFFAIRS.txt exists and contains feature flag check & scoped search", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-GRADUATE-AFFAIRS.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("feature_graduates_affairs");
    expect(content).toContain("GA MANAGER");
    expect(content).toContain("GA SPECIALIST");
    expect(content).toContain("SCOPED RECORD SEARCH");
    expect(content).toContain("OUTSIDE-SCOPE DENIAL");
  });

  test("Section H: PRODUCTION-E2E-REPORTS-MESSAGES-DOCUMENTS.txt exists and contains scoping & finance guard", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-REPORTS-MESSAGES-DOCUMENTS.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("DEPARTMENT HEAD REPORT SCOPING");
    expect(content).toContain("DEAN FAIL-CLOSED");
    expect(content).toContain("MESSAGING SYSTEM");
    expect(content).toContain("adminFinance = false");
  });

  test("Section I: PRODUCTION-E2E-PWA-PRIVACY.txt exists and contains PWA manifest & cache security audits", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "PRODUCTION-E2E-PWA-PRIVACY.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("manifest.json");
    expect(content).toContain("Cache-Control: no-store");
    expect(content).toContain("LOGOUT FLOW");
    expect(content).toContain("DATA LEAK PREVENTION");
    expect(content).toContain("RTL LAYOUT COMPLIANCE");
  });

  test("Section J: UNIVERSITY-COUNCIL-DEMO-SCRIPT-01.md exists and contains exact 9-station live order", () => {
    const filePath = join(GO_LIVE_DIR, "UNIVERSITY-COUNCIL-DEMO-SCRIPT-01.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("لوحة التحكم المركزية للأدمن");
    expect(content).toContain("بوابة المجالس الأكاديمية");
    expect(content).toContain("مكتب العميد");
    expect(content).toContain("رئيس القسم وازدواجية المجالس");
    expect(content).toContain("مشاريع التخرج");
    expect(content).toContain("شؤون الخريجين");
    expect(content).toContain("مركز التقارير والإحصاءات");
    expect(content).toContain("إصدار الوثائق والتحقق الفوري");
    expect(content).toContain("بوابة خدمات الطلاب");
  });

  test("Section K: POST-DEPLOY-PRODUCTION-E2E-MASTER.txt exists and contains continuous long mission runway", () => {
    const filePath = join(OPERATOR_PACKETS_DIR, "POST-DEPLOY-PRODUCTION-E2E-MASTER.txt");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("POST-DEPLOY PRODUCTION E2E MASTER RUNNER PLAN");
    expect(content).toContain("NO HUMAN INTERVENTION PAUSES");
    expect(content).toContain("SECTION 1: DEPLOYMENT PUBLISH & SHA PROOF");
    expect(content).toContain("SECTION 13: PWA INSTALLABILITY & PRIVACY AUDIT");
    expect(content).toContain("PASS_PORTAL_GO_LIVE_DEPLOY_PRODUCTION_E2E_AND_DATA_RECONCILIATION_LONGRUN_01");
  });
});
