import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { STATE_LABELS, type GraduationProjectState } from "@/components/graduation-projects/mvp-ui";
import { useGraduationProjectAdministrationReport } from "../-graduation-projects-adapter";
import { GraduationCap, Archive, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/graduation-projects")({
  component: AdminGraduationProjects,
});

const CANONICAL_STATES = Object.keys(STATE_LABELS) as GraduationProjectState[];

const STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "جميع الحالات" },
  ...CANONICAL_STATES.map((value) => ({ value, label: STATE_LABELS[value] })),
];

function AdminGraduationProjects() {
  const query = useGraduationProjectAdministrationReport();
  const [selectedState, setSelectedState] = useState<string>("all");

  const projects = query.data?.projects ?? [];
  const counts = query.data?.counts;

  const filteredProjects = useMemo(() => {
    if (selectedState === "all") return projects;
    return projects.filter((p) => p.state === selectedState);
  }, [projects, selectedState]);

  const completedCount = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.state === "archived" ||
          p.finalDecision === "passed" ||
          p.finalDecision === "failed",
      ).length,
    [projects],
  );

  return (
    <main dir="rtl" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">نظرة عامة على مشاريع التخرج</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            عرض إداري رصين للحالات والنتائج فقط، دون إجراءات تشغيلية.
          </p>
        </div>
        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="state-filter" className="text-xs font-bold text-muted-foreground whitespace-nowrap">
              تصفية حسب الحالة:
            </label>
            <select
              id="state-filter"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <MvpLoading />
      ) : query.error ? (
        <MvpError
          message={query.error.message || "تعذر تحميل النشرة الإدارية لمشاريع التخرج."}
          retry={() => void query.refetch()}
        />
      ) : !projects.length ? (
        <MvpEmpty message="لا توجد مشاريع متاحة للعرض الإداري." />
      ) : (
        <div className="space-y-6" data-testid="administration-read-only">
          {counts && (
            <div className="grid gap-4 sm:grid-cols-3" data-testid="admin-gp-kpis">
              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-semibold">إجمالي المشاريع</div>
                  <div className="text-xl font-extrabold text-primary">{counts.total ?? projects.length}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-semibold">المشاريع المكتملة</div>
                  <div className="text-xl font-extrabold text-primary">{completedCount}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-semibold">المؤرشفة</div>
                  <div className="text-xl font-extrabold text-primary">
                    {counts.archived ?? projects.filter((p) => p.state === "archived").length}
                  </div>
                </div>
              </div>
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <MvpEmpty message="لا توجد مشاريع تطابق الفلتر المحدد." />
          ) : (
            <MvpProjectList projects={filteredProjects} readOnly />
          )}
        </div>
      )}
    </main>
  );
}
