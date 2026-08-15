/**
 * PORTAL-REPORTS-THREE-LEVEL-OPERATIONAL-UX-CLOSURE-01
 *
 * Three-level operational workspace: Attention → KPIs → All Reports.
 * Pure builders + static render + source contracts. No production I/O.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import { ReportsAttentionSection } from "@/components/reports/ReportsAttentionSection";
import {
  ATTENTION_EMPTY_MESSAGE_AR,
  ATTENTION_SECTION_TITLE_AR,
  CATALOG_SECTION_TITLE_AR,
  KPI_SECTION_TITLE_AR,
  STUDY_GROUPS_TERM_AR,
  assertNoPiiInStrategicAttention,
  buildAcademicAffairsAttention,
  buildAdminAttention,
  buildAlumniQualityAttention,
  buildDeanAttention,
  buildDepartmentAttention,
  buildFacultyAttention,
  buildOperationalUnitAttention,
  buildStrategicAttention,
  buildStudentAttention,
  buildVpAcademicAttention,
  buildVpStudentAttention,
  filterAttentionActions,
  metricMustNotFabricateAttention,
} from "@/lib/reports/attention";
import {
  REPORT_CATALOG_ENTRIES,
  endUserCatalogEntries,
  isReportOpenable,
} from "@/lib/reports/catalog";
import {
  metricIncomplete,
  metricNoAccess,
  metricNoData,
  metricNotConfigured,
  metricValue,
} from "@/lib/reports/scope";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function readSrc(rel: string): string {
  return readFileSync(`${ROOT}/${rel}`, "utf8");
}

const WORKSPACE_SRC = readSrc(
  "src/components/reports/ReportsOperationalWorkspace.tsx",
);
const STUDENT_ROUTE = readSrc("src/routes/student.reports.tsx");
const FACULTY_ROUTE = readSrc("src/routes/faculty-portal.reports.tsx");
const DEPT_ROUTE = readSrc("src/routes/admin/department-reports.tsx");
const EXEC_ROUTE = readSrc("src/routes/admin/executive-reports.tsx");
const ADMIN_ROUTE = readSrc("src/routes/admin/reports.tsx");
const FUNCTIONS_SRC = readSrc("src/lib/beneficiary-reports.functions.ts");
const SERVICES_SRC = readSrc(
  "src/lib/reports/beneficiary-report-services.ts",
);

describe("1 — level order: Attention before KPIs before All Reports", () => {
  test("workspace source renders Attention then KPIs then Catalog", () => {
    const attn = WORKSPACE_SRC.indexOf("ReportsAttentionSection");
    const kpis = WORKSPACE_SRC.indexOf("ReportsPrimaryKpis");
    const catalog = WORKSPACE_SRC.indexOf("ReportsCatalogSection");
    expect(attn).toBeGreaterThan(0);
    expect(kpis).toBeGreaterThan(attn);
    expect(catalog).toBeGreaterThan(kpis);
  });

  test("rendered DOM order matches three levels", () => {
    const html = renderToStaticMarkup(
      createElement(ReportsOperationalWorkspace, {
        attentionItems: [
          {
            id: "a1",
            severity: "warning",
            titleAr: "تنبيه تجريبي",
            sourceCode: "test.source",
          },
        ],
        kpiTiles: [
          { label: "مؤشر", metric: metricValue(3) },
        ],
        catalog: {
          entries: [],
          viewerRoles: ["student"],
          title: CATALOG_SECTION_TITLE_AR,
        },
      }),
    );
    const iAttn = html.indexOf('data-reports-level="attention"');
    const iKpis = html.indexOf('data-reports-level="kpis"');
    const iCat = html.indexOf('data-reports-level="catalog"');
    expect(iAttn).toBeGreaterThanOrEqual(0);
    expect(iKpis).toBeGreaterThan(iAttn);
    expect(iCat).toBeGreaterThan(iKpis);
    expect(html).toContain(ATTENTION_SECTION_TITLE_AR);
    expect(html).toContain(KPI_SECTION_TITLE_AR);
    expect(html).toContain(CATALOG_SECTION_TITLE_AR);
  });

  test("all five report hubs use ReportsOperationalWorkspace", () => {
    // Phase H: the student hub keeps the workspace but replaces the generic
    // multi-beneficiary catalog with the student-safe projected list.
    expect(STUDENT_ROUTE).toContain("ReportsOperationalWorkspace");
    expect(STUDENT_ROUTE).toContain("StudentSelfReportsList");
    expect(STUDENT_ROUTE).not.toContain("جميع التقارير");
    // FIX_05: the faculty hub replaces the generic catalog with role-scoped
    // sections (my reports / my department reports) — no cross-role leakage.
    expect(FACULTY_ROUTE).toContain("ReportsOperationalWorkspace");
    expect(FACULTY_ROUTE).toContain("RoleScopedReportSections");
    expect(FACULTY_ROUTE).not.toContain("جميع التقارير");
    for (const src of [
      DEPT_ROUTE,
      EXEC_ROUTE,
      ADMIN_ROUTE,
    ]) {
      expect(src).toContain("ReportsOperationalWorkspace");
      expect(src).toContain("جميع التقارير");
    }
  });
});

describe("2 — student SELF only", () => {
  test("route remains self-scoped and uses student attention builder", () => {
    expect(STUDENT_ROUTE).toContain("نطاق ذاتي فقط");
    expect(STUDENT_ROUTE).toContain("buildStudentAttention");
    expect(STUDENT_ROUTE).toContain("returnedForCompletion");
    expect(STUDENT_ROUTE).not.toContain("department_id");
  });

  test("open requests alone do not fabricate attention", () => {
    expect(
      buildStudentAttention({ returnedForCompletion: 0 }),
    ).toHaveLength(0);
    expect(
      buildStudentAttention({ returnedForCompletion: null }),
    ).toHaveLength(0);
  });

  test("returned-for-completion produces actionable attention", () => {
    const items = buildStudentAttention({ returnedForCompletion: 2 });
    expect(items).toHaveLength(1);
    expect(items[0]!.actionTo).toBe("/student/requests");
    expect(items[0]!.sourceCode).toContain("returned");
  });

  test("service exposes returnedForCompletion without inventing alerts", () => {
    expect(SERVICES_SRC).toContain("returnedForCompletion");
    expect(SERVICES_SRC).toContain("ذاتي فقط");
  });
});

describe("3 — faculty ASSIGNED only", () => {
  test("route uses assigned-scope copy and faculty attention", () => {
    expect(FACULTY_ROUTE).toContain("buildFacultyAttention");
    expect(FACULTY_ROUTE).toContain("المجموعات الدراسية المسندة");
    expect(FACULTY_ROUTE).toContain("المسندة إليك فقط");
  });

  test("draft/stale materials only when metric value > 0", () => {
    expect(
      buildFacultyAttention({
        draftMaterials: metricValue(0),
        staleMaterials: metricNoData(),
      }),
    ).toHaveLength(0);
    const items = buildFacultyAttention({
      draftMaterials: metricValue(4),
      staleMaterials: metricValue(1),
    });
    expect(items.length).toBe(2);
    expect(items.every((i) => i.actionTo === "/faculty-portal/materials")).toBe(
      true,
    );
  });
});

describe("4 — department weeklyIssues → Attention", () => {
  test("weeklyIssues with unassigned sections become attention", () => {
    const items = buildDepartmentAttention({
      weeklyIssues: [
        {
          code: "unassigned_sections",
          label_ar: "المجموعات الدراسية غير المسندة تحتاج تدخلاً",
          count: 5,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.titleAr).toContain(STUDY_GROUPS_TERM_AR);
    expect(items[0]!.sourceCode).toBe("weeklyIssues.unassigned_sections");
    expect(items[0]!.count).toBe(5);
  });

  test("department route wires weeklyIssues into attention builder", () => {
    expect(DEPT_ROUTE).toContain("buildDepartmentAttention");
    expect(DEPT_ROUTE).toContain("weeklyIssues");
    expect(FUNCTIONS_SRC).toContain("weeklyIssues");
    expect(FUNCTIONS_SRC).toContain("المجموعات الدراسية غير المسندة");
  });
});

describe("5 — empty Attention neutral message", () => {
  test("empty section shows canonical neutral copy", () => {
    const html = renderToStaticMarkup(
      createElement(ReportsAttentionSection, { items: [] }),
    );
    expect(html).toContain(ATTENTION_EMPTY_MESSAGE_AR);
    expect(html).toContain('data-attention-empty="true"');
    expect(html).not.toContain("data-attention-severity");
  });
});

describe("6 — no fabricated issue from zero / NO_DATA", () => {
  test("zero and non-value presence never become warnings", () => {
    expect(metricMustNotFabricateAttention(metricValue(0))).toBe(true);
    expect(metricMustNotFabricateAttention(metricNoData())).toBe(true);
    expect(metricMustNotFabricateAttention(metricIncomplete())).toBe(true);
    expect(metricMustNotFabricateAttention(metricNoAccess())).toBe(true);
    expect(metricMustNotFabricateAttention(metricNotConfigured())).toBe(true);
    expect(metricMustNotFabricateAttention(metricValue(3))).toBe(false);

    expect(
      buildOperationalUnitAttention({ overdue: metricValue(0) }),
    ).toHaveLength(0);
    expect(
      buildOperationalUnitAttention({ overdue: metricNoData() }),
    ).toHaveLength(0);
    expect(
      buildAcademicAffairsAttention({
        unassignedSections: metricNoData(),
      }),
    ).toHaveLength(0);
    expect(buildAdminAttention({ failedImports: 0 })).toHaveLength(0);
    expect(buildAdminAttention({})).toHaveLength(0);
  });
});

describe("7 — dean missing college: no valid college attention/KPIs", () => {
  test("builder returns empty without collegeScopeConfigured", () => {
    const items = buildDeanAttention({
      collegeScopeConfigured: false,
      kpis: {
        pendingRequests: metricNoAccess("college binding pending"),
        students: metricNoAccess("college binding pending"),
      },
    });
    expect(items).toHaveLength(0);
  });

  test("executive route requires college binding for dean view", () => {
    expect(EXEC_ROUTE).toContain("collegeScopeConfigured");
    expect(EXEC_ROUTE).toContain("buildDeanAttention");
    expect(EXEC_ROUTE).toContain("تقارير الكلية");
  });
});

describe("8 — VP without explicit binding: no VP workspace", () => {
  test("VP builders return empty when unbound", () => {
    expect(
      buildVpStudentAttention({
        vpStudentAffairsBound: false,
        studentsNoProgram: metricValue(9),
      }),
    ).toHaveLength(0);
    expect(
      buildVpAcademicAttention({
        vpAcademicAffairsBound: false,
        unassignedSections: metricValue(9),
      }),
    ).toHaveLength(0);
  });

  test("executive allowedViews gate on VP bindings", () => {
    expect(EXEC_ROUTE).toContain("vpStudentAffairsBound");
    expect(EXEC_ROUTE).toContain("vpAcademicAffairsBound");
    expect(EXEC_ROUTE).toContain("تقارير شؤون الطلاب");
    expect(EXEC_ROUTE).toContain("التقارير الأكاديمية");
  });
});

describe("9 — presidency without binding: no strategic workspace", () => {
  test("strategic builder empty when unbound", () => {
    expect(
      buildStrategicAttention({
        universityPresidencyBound: false,
        aggregateRisks: [
          { code: "x", titleAr: "خطر", count: 3 },
        ],
      }),
    ).toHaveLength(0);
  });

  test("executive gates strategic on universityPresidencyBound", () => {
    expect(EXEC_ROUTE).toContain("universityPresidencyBound");
    expect(EXEC_ROUTE).toContain("المؤشرات والتقارير الاستراتيجية");
  });
});

describe("10 — operational unit isolation", () => {
  test("overdue attention only from proven processing.overdue", () => {
    const items = buildOperationalUnitAttention({
      overdue: metricValue(7),
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.sourceCode).toBe("processing.overdue");
    expect(items[0]!.actionTo).toBe("/admin/student-requests");
  });

  test("executive operational view requires operationalUnitCodes", () => {
    expect(EXEC_ROUTE).toContain("operationalUnitCodes");
    expect(EXEC_ROUTE).toContain("buildOperationalUnitAttention");
    expect(EXEC_ROUTE).toContain("تقارير الوحدة");
  });
});

describe("11 — Attention action route is allowed", () => {
  test("disallowed actionTo is stripped", () => {
    const raw = buildStudentAttention({
      returnedForCompletion: 1,
      allowedActionTos: ["/student/requests"],
    });
    expect(raw[0]!.actionTo).toBe("/student/requests");

    const stripped = filterAttentionActions(raw, ["/other"]);
    expect(stripped[0]!.actionTo).toBeUndefined();
    expect(stripped[0]!.sourceCode).toBe(raw[0]!.sourceCode);
  });
});

describe("12 — terminology regression: المجموعات الدراسية", () => {
  test("modified report UX surfaces use official term", () => {
    expect(FACULTY_ROUTE).toContain(STUDY_GROUPS_TERM_AR);
    expect(DEPT_ROUTE).toContain("المجموعات الدراسية المسندة");
    expect(DEPT_ROUTE).toContain("المجموعات الدراسية غير المسندة");
    expect(EXEC_ROUTE).toContain(STUDY_GROUPS_TERM_AR);
    expect(FUNCTIONS_SRC).toContain("المجموعات الدراسية غير المسندة");
    expect(SERVICES_SRC).toContain("المجموعات الدراسية المسندة");
  });

  test("department attention title uses المجموعات الدراسية", () => {
    const items = buildDepartmentAttention({
      unassignedSections: metricValue(2),
    });
    expect(items[0]!.titleAr).toContain(STUDY_GROUPS_TERM_AR);
    expect(items[0]!.titleAr).not.toContain("شعب");
  });
});

describe("13 — ReportsCenter still scope-aware", () => {
  test("hubs still pass viewerScope into catalog section", () => {
    // Phase H: student hub has no client-side catalog projection at all.
    expect(STUDENT_ROUTE).not.toContain("viewerScope");
    // FIX_05: the faculty hub replaces the generic catalog with role-scoped
    // sections (my reports / my department reports) — no cross-role leakage.
    expect(FACULTY_ROUTE).toContain("ReportsOperationalWorkspace");
    expect(FACULTY_ROUTE).toContain("RoleScopedReportSections");
    expect(FACULTY_ROUTE).not.toContain("جميع التقارير");
    for (const src of [
      DEPT_ROUTE,
      EXEC_ROUTE,
      ADMIN_ROUTE,
    ]) {
      expect(src).toContain("viewerScope");
      expect(src).toContain("catalogViewerFromActorScope");
    }
  });

  test("ReportsCatalogSection still wraps ReportsCenter", () => {
    const catalogSrc = readSrc(
      "src/components/reports/ReportsCatalogSection.tsx",
    );
    expect(catalogSrc).toContain("ReportsCenter");
    expect(catalogSrc).toContain(CATALOG_SECTION_TITLE_AR);
  });
});

describe("14 — BLOCKED entries not openable", () => {
  test("end-user catalog still hides BLOCKED; openable excludes them", () => {
    const entries = endUserCatalogEntries(REPORT_CATALOG_ENTRIES, ["admin"]);
    for (const e of entries) {
      expect(e.status).not.toBe("BLOCKED");
    }
    const blocked = REPORT_CATALOG_ENTRIES.filter((e) => e.status === "BLOCKED");
    expect(blocked.length).toBeGreaterThan(0);
    for (const e of blocked) {
      expect(isReportOpenable(e)).toBe(false);
    }
  });
});

describe("15 — no PII in strategic attention", () => {
  test("aggregate-only titles pass; PII blob throws", () => {
    const ok = buildStrategicAttention({
      universityPresidencyBound: true,
      aggregateRisks: [
        {
          code: "pending_student_services",
          titleAr: "خدمات طلابية معلّقة (تجميعي)",
          count: 12,
        },
      ],
    });
    expect(ok).toHaveLength(1);
    expect(() => assertNoPiiInStrategicAttention(ok)).not.toThrow();

    expect(() =>
      assertNoPiiInStrategicAttention([
        {
          id: "bad",
          severity: "info",
          titleAr: "طالب 123456789",
          sourceCode: "x",
        },
      ]),
    ).toThrow(/PII/);
  });

  test("alumni blocked families do not fabricate attention", () => {
    expect(
      buildAlumniQualityAttention({
        pendingGraduationCandidates: metricNoAccess("blocked"),
        blockedFamilies: ["ALU-COHORT-EMPLOYMENT"],
      }),
    ).toHaveLength(0);
  });
});
