import { createFileRoute, useRouteContext, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2, AlertCircle } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getDepartmentReportsSummary,
  getMyReportScope,
} from "@/lib/beneficiary-reports.functions";
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import { buildDepartmentAttention } from "@/lib/reports/attention";

export const Route = createFileRoute("/admin/department-reports")({
  head: () => ({
    meta: [
      { title: "تقارير القسم — بوابة الإدارة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DepartmentReportsPage,
});

function DepartmentReportsPage() {
  const { adminSession } = useRouteContext({ from: "/admin" });
  const roles = adminSession?.roles ?? ["department_head"];
  const fetchSummary = useServerFn(getDepartmentReportsSummary);
  const fetchScope = useServerFn(getMyReportScope);

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const { data: actorScope, isLoading: isScopeLoading } = useQuery({
    queryKey: ["department-reports-scope"],
    queryFn: () => fetchScope(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const resolvedRoles = actorScope?.roles ?? roles;

  /** Explicit department selector — admin / system_admin only (existing contract). */
  const isPrivilegedAdmin = useMemo(
    () => resolvedRoles.some((role) => ["system_admin", "admin"].includes(role)),
    [resolvedRoles],
  );

  /**
   * Dean must NOT enumerate or submit arbitrary department IDs.
   * No trustworthy college→department containment exists server-side yet —
   * fail closed and direct to College / Reports Center.
   */
  const isDeanWithoutAdmin = useMemo(
    () =>
      resolvedRoles.includes("dean") &&
      !resolvedRoles.some((role) => ["system_admin", "admin"].includes(role)),
    [resolvedRoles],
  );

  const { data: departments = [] } = useQuery({
    queryKey: ["department-list-for-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name_ar")
        .order("name_ar");
      if (error) return [];
      return data ?? [];
    },
    enabled: isPrivilegedAdmin,
    staleTime: 300_000,
  });

  // Auto-select: department_head uses bound dept; admin may pick from list.
  useEffect(() => {
    if (isDeanWithoutAdmin) {
      setSelectedDepartmentId(null);
      return;
    }
    if (!isPrivilegedAdmin && actorScope?.departmentId) {
      setSelectedDepartmentId(actorScope.departmentId);
    } else if (isPrivilegedAdmin && departments.length > 0 && !selectedDepartmentId) {
      setSelectedDepartmentId(departments[0].id);
    }
  }, [
    actorScope?.departmentId,
    isPrivilegedAdmin,
    isDeanWithoutAdmin,
    departments,
    selectedDepartmentId,
  ]);

  const targetDeptId = isDeanWithoutAdmin
    ? null
    : (selectedDepartmentId ??
      (!isPrivilegedAdmin ? actorScope?.departmentId ?? null : null));

  const { data, isLoading: isSummaryLoading, error } = useQuery({
    queryKey: ["department-reports-summary", targetDeptId],
    queryFn: () => fetchSummary({ data: { department_id: targetDeptId ?? undefined } }),
    enabled: Boolean(targetDeptId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const isLoading =
    isScopeLoading || (Boolean(targetDeptId) && isSummaryLoading);

  const viewerScope = actorScope
    ? catalogViewerFromActorScope(actorScope)
    : null;

  const attentionItems = useMemo(
    () =>
      buildDepartmentAttention({
        weeklyIssues: data?.weeklyIssues ?? [],
        unassignedSections: data?.teachingLoad?.unassignedSections ?? null,
        allowedActionTos: [
          "/admin/reports?tab=schedules",
          "/admin/course-offerings",
          "/admin/schedules",
        ],
      }),
    [data?.weeklyIssues, data?.teachingLoad?.unassignedSections],
  );

  const kpiTiles = useMemo(
    () =>
      data
        ? [
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
          ]
        : [],
    [data],
  );

  const showScopeGate = !isLoading && (!targetDeptId || error);

  return (
    <div dir="rtl" className="p-4 md:p-6 space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : showScopeGate ? (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-xl mx-auto text-center">
          <div className="flex justify-center text-amber-600">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-lg font-bold text-primary">تحديد نطاق القسم</h2>
          <p className="text-sm text-muted-foreground">
            {error
              ? (error as Error).message || "تعذر تحميل تقارير القسم."
              : isDeanWithoutAdmin
                ? "نطاق تقارير الأقسام للعميد غير متاح حتى يتوفر ربط كلية→أقسام موثوق على الخادم. استخدم تقارير الكلية أو مركز التقارير — لا يُسمح باختيار قسم اعتباطي."
                : "يتطلب استعراض تقارير القسم تحديد قسم صريح أو امتلاك ربط قسم معتمد. يمكنك الاطلاع على التقارير العامة من مركز التقارير."}
          </p>
          {isPrivilegedAdmin && departments.length > 0 && (
            <div className="pt-2 flex flex-col items-center gap-2">
              <label htmlFor="error-dept-select" className="text-xs font-semibold text-muted-foreground">
                اختر قسماً للعرض:
              </label>
              <select
                id="error-dept-select"
                value={selectedDepartmentId ?? ""}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-bold text-primary"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            {isDeanWithoutAdmin && (
              <Link
                to="/admin/executive-reports"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-primary"
              >
                تقارير الكلية
              </Link>
            )}
            <Link
              to="/admin/reports"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              الانتقال إلى مركز التقارير
            </Link>
          </div>
        </div>
      ) : (
        <ReportsOperationalWorkspace
          attentionItems={attentionItems}
          kpiTiles={kpiTiles}
          header={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-7 w-7 text-gold shrink-0" />
                <div>
                  <h1 className="text-xl font-bold">تقارير القسم</h1>
                  <p className="text-sm text-muted-foreground">
                    رئيس القسم يرى قسمه فقط — لا يوجد تجاوز لقسم آخر.
                    {data?.scopeLabelAr ? ` — ${data.scopeLabelAr}` : ""}
                  </p>
                </div>
              </div>
              {isPrivilegedAdmin && departments.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="dept-select" className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                    القسم:
                  </label>
                  <select
                    id="dept-select"
                    value={selectedDepartmentId ?? ""}
                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          }
          betweenKpisAndCatalog={
            data?.links?.length ? (
              <section className="space-y-2" aria-label="روابط">
                <h2 className="font-semibold">روابط</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.links.map((link: { to: string; label: string }) => (
                    <li key={link.to}>
                      <a
                        href={link.to}
                        className="block rounded-md border border-border px-3 py-2 text-sm font-bold text-primary hover:border-gold"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          }
          catalog={{
            entries: REPORT_CATALOG_ENTRIES,
            viewerRoles: viewerScope?.roles?.length
              ? viewerScope.roles
              : roles.length
                ? roles
                : ["department_head"],
            viewerScope,
            title: "جميع التقارير",
            defaultGrouping: "status",
          }}
        />
      )}
    </div>
  );
}
