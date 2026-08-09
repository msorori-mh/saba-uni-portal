import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { ScopedKpiGrid } from "@/components/reports/ScopedKpiGrid";
import { ReportsCenter } from "@/components/reports-center/ReportsCenter";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import {
  getFacultySelfReportsSummary,
  getMyReportScope,
} from "@/lib/beneficiary-reports.functions";

export const Route = createFileRoute("/faculty-portal/reports")({
  head: () => ({
    meta: [
      { title: "تقاريري — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyReportsPage,
});

function FacultyReportsPage() {
  const fetchSummary = useServerFn(getFacultySelfReportsSummary);
  const fetchScope = useServerFn(getMyReportScope);
  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-self-reports"],
    queryFn: () => fetchSummary(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: actorScope } = useQuery({
    queryKey: ["faculty-reports-scope"],
    queryFn: () => fetchScope(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const viewerScope = actorScope
    ? catalogViewerFromActorScope(actorScope)
    : null;
  const viewerRoles = viewerScope?.roles?.length
    ? viewerScope.roles
    : ["faculty_member"];

  return (
    <FacultyPortalShell
      title="تقاريري"
      breadcrumbs={[{ label: "تقاريري" }]}
    >
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6" dir="rtl">
        <p className="text-sm text-muted-foreground">
          نطاق المقررات والمجموعات والمشاريع المسندة إليك فقط.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {(error as Error).message || "تعذر تحميل التقارير"}
          </p>
        ) : data ? (
          <>
            <p className="text-sm text-muted-foreground">{data.scopeLabelAr}</p>
            <ScopedKpiGrid
              tiles={[
                {
                  label: "شعب مسندة",
                  metric: data.teachingLoad.assignedSections,
                },
                {
                  label: "ساعات معتمدة",
                  metric: data.teachingLoad.totalCreditHours,
                },
                {
                  label: "مواد تعليمية",
                  metric: data.materials.totalMaterials,
                },
                {
                  label: "مواد منشورة",
                  metric: data.materials.published,
                },
              ]}
            />
            <section className="space-y-2">
              <h2 className="font-semibold">روابط سريعة</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.links.map((link) => (
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
          </>
        ) : null}

        <ReportsCenter
          entries={REPORT_CATALOG_ENTRIES}
          viewerRoles={viewerRoles}
          viewerScope={viewerScope}
          title="كتالوج تقارير عضو هيئة التدريس"
          showPreparation={false}
        />
      </div>
    </FacultyPortalShell>
  );
}
