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
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import type { ScopedMetric } from "@/lib/reports/scope";
import type { MetricTile } from "@/components/reports/ScopedKpiGrid";
import type { ReportAttentionItem } from "@/lib/reports/attention";
import {
  buildAcademicAffairsAttention,
  buildAlumniQualityAttention,
  buildDeanAttention,
  buildOperationalUnitAttention,
  buildStrategicAttention,
  buildVpAcademicAttention,
  buildVpStudentAttention,
} from "@/lib/reports/attention";

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

const VIEW_TITLES: Record<ViewId, string> = {
  strategic: "المؤشرات والتقارير الاستراتيجية",
  dean: "تقارير الكلية",
  vp_student: "تقارير شؤون الطلاب",
  vp_academic: "التقارير الأكاديمية",
  operational: "تقارير الوحدة",
  academic_affairs: "تقارير الشؤون الأكاديمية",
  alumni: "تقارير الخريجين والجودة",
};

const KPI_LABELS_AR: Record<string, string> = {
  students: "الطلاب",
  activeStudents: "طلاب نشطون",
  suspendedStudents: "طلاب موقفون",
  studentsNoProgram: "بلا برنامج",
  pendingRequests: "طلبات معلّقة",
  issuedDocuments: "وثائق صادرة",
  faculty: "أعضاء هيئة التدريس",
  programs: "البرامج",
  courses: "المقررات",
  studyPlans: "الخطط الدراسية",
  activeSections: "المجموعات الدراسية النشطة",
  staff: "الموظفون",
  documentsToday: "وثائق اليوم",
  pendingStudentServices: "خدمات طلابية معلّقة",
  pendingGraduationCandidates: "مرشحو تخرج معلّقون",
  employmentAggregates: "تجميعات التوظيف",
  surveyAggregates: "تجميعات الاستبيانات",
  consentCompliance: "امتثال الموافقات",
};

function tilesFromKpis(
  kpis: Record<string, ScopedMetric<number>> | undefined,
  max = 6,
): MetricTile[] {
  if (!kpis) return [];
  return Object.entries(kpis)
    .slice(0, max)
    .map(([key, metric]) => ({
      label: KPI_LABELS_AR[key] ?? key,
      metric,
    }));
}

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
            [
              "admin",
              "system_admin",
              "registrar",
              "student_affairs",
              "finance_officer",
            ].includes(r),
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
    : (allowedViews[0]?.id ?? "operational");

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive-reports", activeView],
    queryFn: () => fetchers[activeView](),
    enabled: allowedViews.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const attentionItems = useMemo((): ReportAttentionItem[] => {
    if (!data) return [];
    switch (activeView) {
      case "operational":
        return buildOperationalUnitAttention({
          overdue: data.processing?.overdue ?? null,
        });
      case "academic_affairs":
        return buildAcademicAffairsAttention({
          unassignedSections:
            data.teachingLoad?.unassignedSections ??
            data.unassignedSections ??
            null,
        });
      case "alumni":
        return buildAlumniQualityAttention({
          pendingGraduationCandidates:
            data.kpis?.pendingGraduationCandidates ?? null,
          blockedFamilies: data.blockedFamilies ?? null,
        });
      case "dean":
        return buildDeanAttention({
          collegeScopeConfigured: Boolean(bindings?.collegeScopeConfigured),
          kpis: data.kpis ?? null,
        });
      case "vp_student":
        return buildVpStudentAttention({
          vpStudentAffairsBound: Boolean(bindings?.vpStudentAffairsBound),
          studentsNoProgram: data.kpis?.studentsNoProgram ?? null,
        });
      case "vp_academic":
        return buildVpAcademicAttention({
          vpAcademicAffairsBound: Boolean(bindings?.vpAcademicAffairsBound),
          unassignedSections: data.teachingLoad?.unassignedSections ?? null,
        });
      case "strategic": {
        const pending = data.kpis?.pendingStudentServices;
        const aggregateRisks =
          pending?.presence === "value" &&
          typeof pending.value === "number" &&
          pending.value > 0
            ? [
                {
                  code: "pending_student_services",
                  titleAr: "خدمات طلابية معلّقة (تجميعي)",
                  count: pending.value,
                  severity: "info" as const,
                },
              ]
            : [];
        return buildStrategicAttention({
          universityPresidencyBound: Boolean(
            bindings?.universityPresidencyBound,
          ),
          aggregateRisks,
        });
      }
      default:
        return [];
    }
  }, [activeView, data, bindings]);

  const kpiTiles = useMemo((): MetricTile[] => {
    if (!data) return [];
    if (activeView === "dean" && !bindings?.collegeScopeConfigured) {
      // Fail-closed: do not present college KPIs as valid without binding.
      return [];
    }
    if (data.kpis) return tilesFromKpis(data.kpis, 6);
    if (activeView === "operational" && data.processing) {
      return [
        { label: "إجمالي الطلبات", metric: data.processing.total },
        { label: "قيد المعالجة", metric: data.processing.pending },
        { label: "متأخرة", metric: data.processing.overdue },
        {
          label: "متوسط أيام الحل",
          metric: data.processing.avgResolutionDays,
        },
      ];
    }
    if (activeView === "academic_affairs" && data.mode === "department") {
      return [
        { label: "طلاب القسم", metric: data.students },
        { label: "أعضاء هيئة التدريس", metric: data.faculty },
        { label: "البرامج", metric: data.programs },
        { label: "المقررات", metric: data.courses },
        {
          label: "المجموعات الدراسية المسندة",
          metric: data.teachingLoad.assignedSections,
        },
        {
          label: "المجموعات الدراسية غير المسندة",
          metric: data.teachingLoad.unassignedSections,
        },
      ].filter((t) => t.metric);
    }
    if (data.teachingLoad) {
      return [
        {
          label: "المجموعات الدراسية المسندة",
          metric: data.teachingLoad.assignedSections,
        },
        {
          label: "المجموعات الدراسية غير المسندة",
          metric: data.teachingLoad.unassignedSections,
        },
        {
          label: "الساعات المعتمدة",
          metric: data.teachingLoad.totalCreditHours,
        },
      ];
    }
    return [];
  }, [activeView, data, bindings]);

  const pageTitle = VIEW_TITLES[activeView] ?? "التقارير والمؤشرات الاستراتيجية";

  return (
    <div dir="rtl" className="p-4 md:p-6">
      {allowedViews.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-gold" />
            <div>
              <h1 className="text-xl font-bold">التقارير والمؤشرات الاستراتيجية</h1>
              <p className="text-sm text-muted-foreground">
                مجمّعات حسب القطاع والربط التنظيمي — بلا سجلات شخصية افتراضياً.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            لا تتوفر مراكز تقارير مفعّلة لربطك التنظيمي الحالي (fail-closed).
          </p>
          <ReportsOperationalWorkspace
            attentionItems={[]}
            kpiTiles={[]}
            catalog={{
              entries: REPORT_CATALOG_ENTRIES,
              viewerRoles: actorScope?.roles?.length
                ? actorScope.roles
                : roles,
              viewerScope: actorScope
                ? catalogViewerFromActorScope(actorScope)
                : null,
              title: "جميع التقارير",
              defaultGrouping: "beneficiary",
            }}
          />
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message || "تعذر تحميل المؤشرات"}
        </p>
      ) : (
        <ReportsOperationalWorkspace
          attentionItems={attentionItems}
          kpiTiles={kpiTiles}
          header={
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-7 w-7 text-gold" />
                <div>
                  <h1 className="text-xl font-bold">{pageTitle}</h1>
                  <p className="text-sm text-muted-foreground">
                    مجمّعات حسب القطاع والربط التنظيمي — بلا سجلات شخصية افتراضياً.
                    {data?.scopeLabelAr ? ` — ${data.scopeLabelAr}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="مراكز المستفيدين">
                {allowedViews.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={activeView === v.id}
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
              {data?.privacy?.includesPii === false ? (
                <p className="text-xs text-muted-foreground">
                  وضع الخصوصية: تصدير مجمّع فقط — لا PII افتراضياً.
                </p>
              ) : null}
            </div>
          }
          catalog={{
            entries: REPORT_CATALOG_ENTRIES,
            viewerRoles: actorScope?.roles?.length ? actorScope.roles : roles,
            viewerScope: actorScope
              ? catalogViewerFromActorScope(actorScope)
              : null,
            title: "جميع التقارير",
            defaultGrouping: "beneficiary",
          }}
        />
      )}
    </div>
  );
}
