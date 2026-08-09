import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import {
  getMyReportScope,
  getDeanCollegeReportsSummary,
  getUniversityStrategicReportsSummary,
  getVpAcademicAffairsReportsSummary,
  getVpStudentAffairsReportsSummary,
  getOperationalUnitReportsSummary,
  getAlumniQualityReportsSummary,
  getAcademicAffairsReportsSummary,
} from "@/lib/beneficiary-reports.functions";
import { ScopedKpiGrid } from "@/components/reports/ScopedKpiGrid";
import { ReportsCenter } from "@/components/reports-center/ReportsCenter";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import type { ScopedMetric } from "@/lib/reports/scope";

export const Route = createFileRoute("/admin/executive-reports")({
  head: () => ({
    meta: [
      { title: "التقارير والمؤشرات الاستراتيجية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExecutiveReportsPage,
});

type ViewId =
  | "strategic"
  | "dean"
  | "vp_student"
  | "vp_academic"
  | "operational"
  | "academic_affairs"
  | "alumni";

function ExecutiveReportsPage() {
  const { adminSession } = useRouteContext({ from: "/admin" });
  const roles = adminSession?.roles ?? [];
  const [view, setView] = useState<ViewId>("operational");

  const scopeFn = useServerFn(getMyReportScope);
  const strategicFn = useServerFn(getUniversityStrategicReportsSummary);
  const deanFn = useServerFn(getDeanCollegeReportsSummary);
  const vpStudentFn = useServerFn(getVpStudentAffairsReportsSummary);
  const vpAcademicFn = useServerFn(getVpAcademicAffairsReportsSummary);
  const operationalFn = useServerFn(getOperationalUnitReportsSummary);
  const academicFn = useServerFn(getAcademicAffairsReportsSummary);
  const alumniFn = useServerFn(getAlumniQualityReportsSummary);

  const { data: actorScope } = useQuery({
    queryKey: ["executive-reports-scope"],
    queryFn: () => scopeFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const bindings = actorScope?.bindings;

  const fetchers: Record<ViewId, () => Promise<any>> = {
    strategic: () => strategicFn(),
    dean: () => deanFn(),
    vp_student: () => vpStudentFn(),
    vp_academic: () => vpAcademicFn(),
    operational: () => operationalFn(),
    academic_affairs: () => academicFn(),
    alumni: () => alumniFn(),
  };

  const allowedViews = useMemo(() => {
    const all: {
      id: ViewId;
      label: string;
      allowed: boolean;
    }[] = [
      {
        id: "strategic",
        label: "رئاسة الجامعة / استراتيجي",
        // Explicit presidency binding only — never dean/registrar inference.
        allowed: Boolean(bindings?.universityPresidencyBound),
      },
      {
        id: "dean",
        label: "عميد الكلية",
        allowed: Boolean(
          bindings?.deanIdentityBound && bindings?.collegeScopeConfigured,
        ),
      },
      {
        id: "vp_student",
        label: "نائب شؤون الطلاب",
        allowed: Boolean(bindings?.vpStudentAffairsBound),
      },
      {
        id: "vp_academic",
        label: "نائب الشؤون الأكاديمية",
        allowed: Boolean(bindings?.vpAcademicAffairsBound),
      },
      {
        id: "operational",
        label: "الوحدات التشغيلية",
        allowed:
          roles.some((r) =>
            ["admin", "system_admin", "registrar", "student_affairs", "finance_officer"].includes(
              r,
            ),
          ) && (bindings?.operationalUnitCodes?.length ?? 0) > 0,
      },
      {
        id: "academic_affairs",
        label: "الشؤون الأكاديمية",
        allowed: roles.some((r) =>
          ["admin", "system_admin", "registrar", "department_head"].includes(r),
        ),
      },
      {
        id: "alumni",
        label: "الخريجون والجودة",
        allowed: roles.some((r) =>
          ["admin", "system_admin", "dean", "registrar"].includes(r),
        ),
      },
    ];
    return all.filter((v) => v.allowed);
  }, [roles, bindings]);

  const activeView = allowedViews.some((v) => v.id === view)
    ? view
    : allowedViews[0]?.id ?? "operational";

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive-reports", activeView],
    queryFn: () => fetchers[activeView](),
    enabled: allowedViews.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const tiles = useMemo(() => {
    if (!data?.kpis) return [] as { label: string; metric: ScopedMetric<number> }[];
    return Object.entries(data.kpis).map(([key, metric]) => ({
      label: key,
      metric: metric as ScopedMetric<number>,
    }));
  }, [data]);

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-gold" />
        <div>
          <h1 className="text-xl font-bold">التقارير والمؤشرات الاستراتيجية</h1>
          <p className="text-sm text-muted-foreground">
            مجمّعات حسب القطاع والربط التنظيمي — بلا سجلات شخصية افتراضياً.
          </p>
        </div>
      </div>

      {allowedViews.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          لا تتوفر مراكز تقارير مفعّلة لربطك التنظيمي الحالي (fail-closed).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {allowedViews.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activeView === v.id
                ? "border-gold bg-gold/10 font-bold"
                : "border-border"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل المؤشرات"}
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">{data.scopeLabelAr}</p>
          {tiles.length > 0 ? <ScopedKpiGrid tiles={tiles} /> : null}
          {data.privacy?.includesPii === false ? (
            <p className="text-xs text-muted-foreground">
              وضع الخصوصية: تصدير مجمّع فقط — لا PII افتراضياً.
            </p>
          ) : null}
        </>
      ) : null}

      <ReportsCenter
        entries={REPORT_CATALOG_ENTRIES}
        viewerRoles={
          actorScope?.roles?.length ? actorScope.roles : roles
        }
        viewerScope={
          actorScope ? catalogViewerFromActorScope(actorScope) : null
        }
        title="كتالوج التقارير حسب المستفيد"
        defaultGrouping="beneficiary"
      />
    </div>
  );
}
