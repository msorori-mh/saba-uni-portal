import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { ReportsOperationalWorkspace } from "@/components/reports/ReportsOperationalWorkspace";
import {
  REPORT_CATALOG_ENTRIES,
  catalogViewerFromActorScope,
} from "@/lib/reports/catalog";
import { buildFacultyAttention } from "@/lib/reports/attention";
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

  const attentionItems = useMemo(
    () =>
      buildFacultyAttention({
        draftMaterials: data?.materials?.draft ?? null,
        staleMaterials: data?.materials?.staleMaterials ?? null,
        allowedActionTos: ["/faculty-portal/materials"],
      }),
    [data?.materials],
  );

  const kpiTiles = useMemo(
    () =>
      data
        ? [
            {
              label: "المجموعات الدراسية المسندة",
              metric: data.teachingLoad.assignedSections,
            },
            {
              label: "الساعات المعتمدة",
              metric: data.teachingLoad.totalCreditHours,
            },
            {
              label: "المواد التعليمية",
              metric: data.materials.totalMaterials,
            },
            {
              label: "المواد المنشورة",
              metric: data.materials.published,
            },
          ]
        : [],
    [data],
  );

  return (
    <FacultyPortalShell
      title="تقاريري"
      breadcrumbs={[{ label: "تقاريري" }]}
    >
      <div className="container mx-auto max-w-5xl px-4 py-6" dir="rtl">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {(error as Error).message || "تعذر تحميل التقارير"}
          </p>
        ) : (
          <ReportsOperationalWorkspace
            attentionItems={attentionItems}
            kpiTiles={kpiTiles}
            header={
              <p className="text-sm text-muted-foreground">
                نطاق المقررات والمجموعات الدراسية والمشاريع المسندة إليك فقط.
                {data?.scopeLabelAr ? ` — ${data.scopeLabelAr}` : ""}
              </p>
            }
            betweenKpisAndCatalog={
              data?.links?.length ? (
                <section className="space-y-2" aria-label="روابط سريعة">
                  <h2 className="font-semibold">روابط سريعة</h2>
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
              viewerRoles,
              viewerScope,
              title: "جميع التقارير",
              showPreparation: false,
            }}
          />
        )}
      </div>
    </FacultyPortalShell>
  );
}
