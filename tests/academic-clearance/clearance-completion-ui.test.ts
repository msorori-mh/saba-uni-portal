import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const badge = read("../../src/components/academic-clearance/ClearanceStatusBadge.tsx");
const summary = read("../../src/components/academic-clearance/ClearanceSummaryPanel.tsx");
const snapshots = read("../../src/components/academic-clearance/ClearanceSnapshotsPanel.tsx");
const minutes = read("../../src/components/academic-clearance/ClearanceMinutes.tsx");
const approvals = read("../../src/components/academic-clearance/ClearanceApprovalsTimeline.tsx");
const reporting = read("../../src/components/academic-clearance/ClearanceReporting.tsx");
const comparison = read("../../src/components/academic-clearance/CourseComparison.tsx");

describe("academic clearance completion UI", () => {
  it("renders all seven statuses including returned", () => {
    expect(badge).toContain("CLEARANCE_STATUS_LABELS");
    for (const status of [
      "draft",
      "department_review",
      "academic_affairs_review",
      "returned",
      "approved",
      "rejected",
      "superseded",
    ])
      expect(badge).toContain(status);
    expect(badge).toContain("حالة المقاصة");
  });

  it("blocks transfer completion before approval in the summary panel", () => {
    expect(summary).toContain("canFinalizeDepartmentTransfer");
    expect(summary).toContain("لا يمكن إتمام التحويل قبل اعتماد المقاصة");
    expect(summary).toContain("المستوى المقترح");
    expect(summary).toContain("الساعات المعتمدة");
    expect(summary).toContain("ClearanceStatusBadge");
  });

  it("shows immutable official result snapshots and target plan snapshots", () => {
    expect(snapshots).toContain("officialResultReference");
    expect(snapshots).toContain("المرجع الرسمي للنتيجة");
    expect(snapshots).toContain("نتائج الطالب الرسمية الناجحة");
    expect(snapshots).toContain("مقررات الخطة المستهدفة");
    expect(snapshots).toContain("إلزامي");
  });

  it("renders the clearance minutes and approvals provenance", () => {
    expect(minutes).toContain("محضر المعادلات");
    expect(minutes).toContain("decisionLabel");
    expect(minutes).toContain("الساعات المعتمدة");
    expect(approvals).toContain("سجل الاعتمادات");
    expect(approvals).toContain("CLEARANCE_APPROVAL_STAGE_LABELS");
    expect(approvals).toContain("CLEARANCE_APPROVAL_DECISION_LABELS");
  });

  it("renders operational and outcome reports with the overdue window", () => {
    expect(reporting).toContain("overdueCount");
    expect(reporting).toContain("avgAcceptedHours");
    expect(reporting).toContain("decisionCount");
    expect(reporting).toContain("14");
    expect(reporting).toContain("تقارير المقاصة");
  });

  it("offers the seven approved decisions in the chair comparison table", () => {
    expect(comparison).toContain("supporting_requirement");
    expect(comparison).toContain("متطلب مساند");
  });
});
