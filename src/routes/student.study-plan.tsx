import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, ArrowRight } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SEMESTER_LABELS,
  fetchMyProgramId,
  fetchMyStudyPlan,
} from "@/lib/student-study-plan";

export const Route = createFileRoute("/student/study-plan")({
  component: StudyPlanPage,
  head: () => ({
    meta: [
      { title: "الخطة الدراسية — بوابة الطالب" },
      { name: "description", content: "عرض الخطة الدراسية للبرنامج مع تصفية حسب المستوى والفصل الدراسي." },
    ],
  }),
});

function StudyPlanPage() {
  const { data: programId, isLoading: loadingProg } = useQuery({
    queryKey: ["student", "program-id"],
    queryFn: fetchMyProgramId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student", "study-plan", programId],
    queryFn: () => fetchMyStudyPlan(programId!),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });

  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");

  const availableLevels = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      const ln = r.level?.level_number ?? 0;
      if (!map.has(ln)) map.set(ln, r.level?.name ?? `المستوى ${ln}`);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, name]) => ({ num, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (levelFilter !== "all" && String(r.level?.level_number ?? 0) !== levelFilter) return false;
      if (semesterFilter !== "all" && r.semester_code !== semesterFilter) return false;
      return true;
    });
  }, [rows, levelFilter, semesterFilter]);

  type Group = { levelName: string; levelNumber: number; semesters: Record<string, PlanCourseRow[]> };
  const grouped = useMemo(() => {
    const map = new Map<number, Group>();
    for (const r of filtered) {
      const ln = r.level?.level_number ?? 0;
      if (!map.has(ln)) map.set(ln, { levelName: r.level?.name ?? `المستوى ${ln}`, levelNumber: ln, semesters: {} });
      const g = map.get(ln)!;
      (g.semesters[r.semester_code] ||= []).push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.levelNumber - b.levelNumber);
  }, [filtered]);

  const totalHours = useMemo(
    () => filtered.reduce((s, r) => s + (r.course?.credit_hours ?? 0), 0),
    [filtered],
  );

  return (
    <PortalShell>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-extrabold text-primary">الخطة الدراسية</h1>
              <p className="text-xs text-muted-foreground">تصفح خطتك الدراسية حسب المستوى والفصل الدراسي.</p>
            </div>
          </div>
          <Link to="/student" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" /> العودة للرئيسية
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground mb-1 block">المستوى</label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المستويات</SelectItem>
                  {availableLevels.map((l) => (
                    <SelectItem key={l.num} value={String(l.num)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground mb-1 block">الفصل الدراسي</label>
              <Select value={semesterFilter} onValueChange={setSemesterFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفصول</SelectItem>
                  <SelectItem value="first">الفصل الأول</SelectItem>
                  <SelectItem value="second">الفصل الثاني</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {filtered.length > 0 && (
            <div className="mt-3 text-[11px] text-muted-foreground">
              عدد المقررات: <span className="font-bold text-primary">{filtered.length}</span> •
              مجموع الساعات: <span className="font-bold text-primary">{totalHours}</span>
            </div>
          )}
        </div>

        {(loadingProg || isLoading) && (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && !loadingProg && rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            لا توجد خطة دراسية مفعّلة لبرنامجك حالياً.
          </div>
        )}

        {!isLoading && rows.length > 0 && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            لا توجد مقررات مطابقة للتصفية.
          </div>
        )}

        <div className="space-y-3">
          {grouped.map((lvl) => (
            <div key={lvl.levelNumber} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{lvl.levelName}</div>
              <div className="grid sm:grid-cols-2 gap-px bg-border">
                {Object.entries(lvl.semesters).map(([sem, items]) => (
                  <div key={sem} className="bg-card p-3">
                    <div className="text-[11px] font-bold text-muted-foreground mb-2">
                      {SEMESTER_LABELS[sem] ?? sem}
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((it) => (
                        <li key={it.id} className="rounded border p-2 text-xs">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono font-bold">{it.course?.code}</span>
                            <span className="text-[10px] text-muted-foreground">{it.course?.credit_hours} س.م</span>
                          </div>
                          <div className="mt-0.5 font-semibold">{it.course?.name_ar}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{it.is_required ? "إجباري" : "اختياري"}</span>
                            {it.prerequisite && <span>• متطلب: <span className="font-mono">{it.prerequisite.code}</span></span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </PortalShell>
  );
}
