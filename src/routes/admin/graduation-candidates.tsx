import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GraduationCap, Loader2, FileSpreadsheet, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getGraduationCandidates, getAcademicProgressFilterLookups } from "@/lib/academic-status.functions";
import { exportProgressXlsx, logAcademicAudit } from "@/lib/academic-status";

export const Route = createFileRoute("/admin/graduation-candidates")({
  component: GraduationCandidatesPage,
});

function GraduationCandidatesPage() {
  const fetchGrads = useServerFn(getGraduationCandidates);
  const lookupsFn = useServerFn(getAcademicProgressFilterLookups);
  const [programId, setProgramId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");

  const lookups = useQuery({
    queryKey: ["lk-grad-filters"],
    queryFn: () => lookupsFn({ data: {} }),
  });

  const list = useQuery({
    queryKey: ["grad-candidates", { programId, departmentId, levelId }],
    queryFn: () => fetchGrads({ data: {
      programId: programId || undefined,
      departmentId: departmentId || undefined,
      levelId: levelId || undefined,
      limit: 300,
    } }),
  });

  const items = list.data ?? [];

  const handleExport = async () => {
    const rows = items.map((s) => ({
      "الرقم الأكاديمي": s.student.academic_number,
      "الاسم": s.student.full_name_ar,
      "البرنامج": s.student.program ?? "—",
      "ساعات مكتسبة": s.progress.completed_hours,
      "إجمالي الخطة": s.progress.total_plan_hours,
      "نسبة الإنجاز": `${s.progress.completion_percentage}%`,
      "النتيجة التراكمية %": s.progress.cumulative_official_average.toFixed(1),
      "إجباري ناقص": s.eligibility.missing_required_courses.length,
      "ساعات متبقية": s.eligibility.missing_hours,
      "مؤهل": s.eligibility.eligible ? "نعم" : "لا",
    }));
    exportProgressXlsx({
      filename: `graduation_candidates_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: "مرشحو التخرج",
      header: [["التقرير", "مرشحو التخرج"], ["التاريخ", new Date().toLocaleDateString("ar-EG-u-nu-latn")], ["العدد", rows.length.toString()]],
      rows,
    });
    await logAcademicAudit("graduation_candidates_viewed", `exported count=${rows.length}`);
  };

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-600" /> مرشحو التخرج
          </h1>
          <p className="text-sm text-muted-foreground">الطلاب المؤهلون للتخرج أو القريبون من إكمال المتطلبات.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!items.length}>
          <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-card p-4 grid gap-3 sm:grid-cols-3">
        <FilterSelect label="البرنامج" value={programId} onChange={setProgramId} options={lookups.data?.programs.map((p) => ({ value: p.id, label: p.name_ar })) ?? []} />
        <FilterSelect label="القسم" value={departmentId} onChange={setDepartmentId} options={lookups.data?.departments.map((p) => ({ value: p.id, label: p.name_ar })) ?? []} />
        <FilterSelect label="المستوى" value={levelId} onChange={setLevelId} options={lookups.data?.levels.map((p) => ({ value: p.id, label: p.name })) ?? []} />
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد مرشحون مطابقون للفلاتر.</div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2 py-2 text-right">الرقم</th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-right">البرنامج</th>
                  <th className="px-2 py-2 text-center">إنجاز %</th>
                  <th className="px-2 py-2 text-center">ساعات</th>
                  <th className="px-2 py-2 text-center">النتيجة %</th>
                  <th className="px-2 py-2 text-center">إجباري ناقص</th>
                  <th className="px-2 py-2 text-center">مؤهل</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.student.id} className="border-t hover:bg-muted/20">
                    <td className="px-2 py-2 font-mono">{s.student.academic_number}</td>
                    <td className="px-2 py-2 font-bold">{s.student.full_name_ar}</td>
                    <td className="px-2 py-2">{s.student.program ?? "—"}</td>
                    <td className="px-2 py-2 text-center font-bold">{s.progress.completion_percentage}%</td>
                    <td className="px-2 py-2 text-center">{s.progress.completed_hours}/{s.progress.total_plan_hours}</td>
                    <td className="px-2 py-2 text-center">{s.progress.cumulative_official_average.toFixed(1)}%</td>
                    <td className="px-2 py-2 text-center">{s.eligibility.missing_required_courses.length}</td>
                    <td className="px-2 py-2 text-center">
                      {s.eligibility.eligible
                        ? <CheckCircle2 className="inline h-4 w-4 text-emerald-600" />
                        : <span className="text-amber-600">قريب</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Link to="/admin/student-progress" className="inline-flex items-center gap-1 text-primary hover:text-gold">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="الكل" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">الكل</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
