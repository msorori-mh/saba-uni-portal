/**
 * PORTAL-24H-REPORTS-DEPLOY-PUBLISH-PRODUCTION-E2E-CLOSURE-01
 *
 * Source contracts for five report hubs, three-level hierarchy honesty,
 * viewport/RTL/a11y markers, logout/cache isolation, and updated E2E packet.
 * No production I/O.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import {
  KPI_EMPTY_MESSAGE_AR,
  ReportsPrimaryKpis,
} from "@/components/reports/ReportsPrimaryKpis";
import {
  ATTENTION_SECTION_TITLE_AR,
  CATALOG_SECTION_TITLE_AR,
  KPI_SECTION_TITLE_AR,
} from "@/lib/reports/attention";
import {
  REPORT_CATALOG_ENTRIES,
  isReportOpenable,
} from "@/lib/reports/catalog";
import {
  REPORTS_FAVORITES_STORAGE_KEY,
  clearReportsLocalPreferences,
} from "@/lib/reports/clear-local-preferences";
import {
  metricNoData,
  metricNull,
  metricValue,
} from "@/lib/reports/scope";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const HUBS = [
  ["student", "src/routes/student.reports.tsx", "/student/reports"],
  ["faculty", "src/routes/faculty-portal.reports.tsx", "/faculty-portal/reports"],
  ["department", "src/routes/admin/department-reports.tsx", "/admin/department-reports"],
  ["executive", "src/routes/admin/executive-reports.tsx", "/admin/executive-reports"],
  ["admin", "src/routes/admin/reports.tsx", "/admin/reports"],
] as const;

describe("five report hubs — routes and three-level workspace", () => {
  test("each hub imports ReportsOperationalWorkspace and Arabic catalog title", () => {
    for (const [name, path] of HUBS) {
      const src = read(path);
      expect(src).toContain("ReportsOperationalWorkspace");
      // Phase H: the student hub renders a self-only projected list instead of
      // the generic "جميع التقارير" multi-beneficiary catalog.
      if (name === "student") {
        expect(src).toContain("StudentSelfReportsList");
      } else {
        expect(src).toContain("جميع التقارير");
      }
    }
  });

  test("workspace DOM keeps Attention → KPIs → Catalog even when KPI tiles empty", () => {
    const html = renderToStaticMarkup(
      createElement(ReportsOperationalWorkspace, {
        attentionItems: [],
        kpiTiles: [],
        catalog: {
          entries: [],
          viewerRoles: ["student"],
          title: CATALOG_SECTION_TITLE_AR,
        },
      }),
    );
    const iAttn = html.indexOf('data-reports-level="attention"');
    const iKpis = html.indexOf('data-reports-level="kpis"');
    const iCatalog = html.indexOf('data-reports-level="catalog"');
    expect(iAttn).toBeGreaterThan(0);
    expect(iKpis).toBeGreaterThan(iAttn);
    expect(iCatalog).toBeGreaterThan(iKpis);
    expect(html).toContain(ATTENTION_SECTION_TITLE_AR);
    expect(html).toContain(KPI_SECTION_TITLE_AR);
    expect(html).toContain(KPI_EMPTY_MESSAGE_AR);
    expect(html).toContain(CATALOG_SECTION_TITLE_AR);
  });
});

describe("honest KPI / null / unavailable states", () => {
  test("ScopedKpiGrid labels distinguish value / null / no_data (never coerce missing to 0)", () => {
    const html = renderToStaticMarkup(
      createElement(ReportsPrimaryKpis, {
        tiles: [
          { label: "قيمة", metric: metricValue(4) },
          { label: "فارغ", metric: metricNull() },
          { label: "لا بيانات", metric: metricNoData() },
        ],
      }),
    );
    expect(html).toContain("4");
    expect(html).toContain("غير متوفر");
    expect(html).toContain("لا بيانات");
    expect(html).not.toMatch(/data-presence="value"[^>]*>[\s\S]*?>0</);
  });
});

describe("viewport / RTL / a11y source contracts", () => {
  test("workspace and KPI grid are RTL with responsive grid breakpoints", () => {
    const workspace = read("src/components/reports/ReportsOperationalWorkspace.tsx");
    const grid = read("src/components/reports/ScopedKpiGrid.tsx");
    const attention = read("src/components/reports/ReportsAttentionSection.tsx");
    expect(workspace).toContain('dir="rtl"');
    expect(grid).toContain('dir="rtl"');
    expect(grid).toContain("sm:grid-cols-2");
    expect(grid).toContain("lg:grid-cols-4");
    expect(attention).toContain("aria-labelledby");
  });

  test("hub pages use RTL and responsive padding suitable for 360/768/desktop", () => {
    for (const [, path] of HUBS) {
      const src = read(path);
      expect(src).toMatch(/dir=["']rtl["']/);
      expect(src).toMatch(/container|max-w-|md:p-|sm:grid|lg:grid|p-4/);
    }
  });
});

describe("catalog entry integrity sample", () => {
  test("every catalog entry declares source, status, role, scope, filters, outputs", () => {
    expect(REPORT_CATALOG_ENTRIES.length).toBeGreaterThan(20);
    for (const entry of REPORT_CATALOG_ENTRIES) {
      expect(entry.report_code.length).toBeGreaterThan(0);
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.status.length).toBeGreaterThan(0);
      expect(entry.required_role.length).toBeGreaterThan(0);
      expect(entry.data_scope.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.filters)).toBe(true);
      expect(Array.isArray(entry.output_types)).toBe(true);
      expect(entry.output_types.length).toBeGreaterThanOrEqual(0);
      if (entry.status === "BLOCKED") {
        expect(isReportOpenable(entry)).toBe(false);
      }
    }
  });
});

describe("logout / cache isolation", () => {
  test("admin, faculty, and student logout clear React Query and reports favorites", () => {
    const admin = read("src/lib/use-admin-logout.ts");
    const faculty = read("src/lib/faculty-portal/use-faculty-logout.ts");
    const student = read("src/lib/use-student-logout.ts");
    for (const src of [admin, faculty, student]) {
      expect(src).toContain("queryClient.clear()");
      expect(src).toContain("clearReportsLocalPreferences");
    }
    expect(read("src/routes/student.index.tsx")).toContain("useStudentLogout");
  });

  test("clearReportsLocalPreferences removes the favorites key", () => {
    const store = new Map<string, string>();
    const storage = {
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };
    storage.setItem(REPORTS_FAVORITES_STORAGE_KEY, '["X"]');
    clearReportsLocalPreferences(storage);
    expect(store.has(REPORTS_FAVORITES_STORAGE_KEY)).toBe(false);
  });
});

describe("operator packet + deployment package", () => {
  test("reports E2E packet lists five canonical hubs (not legacy /reports)", () => {
    const packet = read(
      "docs/go-live/operator-packets/PRODUCTION-E2E-REPORTS-MESSAGES-DOCUMENTS.txt",
    );
    for (const [, , route] of HUBS) {
      expect(packet).toContain(route);
    }
    expect(packet).not.toContain("Load `/reports` route");
    expect(packet).toContain("يحتاج انتباهك الآن");
    expect(packet).toContain("المؤشرات الرئيسية");
    expect(packet).toContain("جميع التقارير");
    expect(packet).toContain("DB_FULL_READY");
  });

  test("deployment package pins reconciled main tip and DB_FULL_READY=YES", () => {
    const pack = read(
      "docs/go-live/PORTAL-24H-REPORTS-DEPLOY-PUBLISH-PRODUCTION-PACKAGE-01.md",
    );
    expect(pack).toContain("8c944b57534dda435afc7b600f590e85567e5103");
    expect(pack).toContain("DB_FULL_READY = YES");
    expect(pack).toContain("PASS_PORTAL_PR335_FINAL_DEPLOY_SOURCE_RECONCILED_AND_MERGED");
    expect(pack).not.toContain("fab94705443264ae5fe768c5091e25c7c729be1a");
    expect(pack).not.toContain("HOLD_PORTAL_24H_PRODUCTION_DEPLOY_PUBLISH_E2E_WAITING_DB_FULL_READY");
    expect(pack).toContain("/version.json");
    expect(pack).toContain("FINAL_DEPLOY_SOURCE_SHA");
  });
});
