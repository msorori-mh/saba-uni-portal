import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, Loader2, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getStudentProgress, searchStudents,
} from "@/lib/academic-status.functions";
import { ProgressSummary, DegreeAudit, EligibilityCard } from "@/components/academic/ProgressSummary";
import { exportProgressXlsx, logAcademicAudit } from "@/lib/academic-status";

export const Route = createFileRoute("/admin/student-progress")({
  component: AdminStudentProgressPage,
});

function AdminStudentProgressPage() {
  const search = useServerFn(searchStudents);
  const fetchProgress = useServerFn(getStudentProgress);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["asp-search", q],
    queryFn: () => search({ data: { query: q } }),
    enabled: q.length >= 1 || q.length === 0,
  });

  const progress = useQuery({
    queryKey: ["asp-progress", selected],
    enabled: !!selected,
    queryFn: () => fetchProgress({ data: { studentProfileId: selected! } }),
  });

  const exportAudit = useMutation({
    mutationFn: async () => {
      if (!progress.data) return;
      const d = progress.data;
      exportProgressXlsx({
        filename: `student_audit_${d.student.academic_number}.xlsx`,
        sheetName: "تدقيق التخرج",
        header: [
          ["الطالب", d.student.full_name_ar],
          ["الرقم الأكاديمي", d.student.academic_number],
          ["البرنامج", d.student.program ?? "—"],
          ["المستوى", d.student.level ?? "غير محدد"],
          ["نسبة الإنجاز", `${d.progress.completion_percentage}%`],
          ["النتيجة التراكمية", `${d.progress.cumulative_official_average.toFixed(1)}%`],
          ["الحالة", d.standing.standing],
        ],
        rows: d.audit.courses.map((c) => ({
          الرمز: c.code,
          الاسم: c.name_ar,
          المستوى: c.level ?? "—",
          الساعات: c.credit_hours,
          النوع: c.is_required ? "إجباري" : "اختياري",
          المحاولات: c.attempts,
          "أفضل %": c.best_percentage ?? "—",
          الحالة: c.status,
        })),
      });
      await logAcademicAudit("graduation_audit_viewed", `exported audit ${d.student.academic_number}`, d.student.id);
    },
  });

  return (
    <div dir="rtl" className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary">تقدم الطلاب الأكاديمي</h1>
        <p className="text-sm text-muted-foreground">ابحث بالاسم أو الرقم الأكاديمي لعرض الملخص، تدقيق التخرج، والأهلية.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم أكاديمي أو اسم الطالب" className="pr-10" />
        </div>
        <div className="flex flex-wrap gap-2">
          {results.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : (results.data ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs text-right hover:border-gold ${selected === r.id ? "border-gold bg-gold/10" : "bg-card"}`}
              >
                <span className="font-bold">{r.full_name_ar}</span>
                <span className="font-mono text-muted-foreground mr-2">{r.academic_number}</span>
                {r.program && <span className="block text-[10px] text-muted-foreground">{r.program}</span>}
              </button>
            ))}
          {results.data && results.data.length === 0 && (
            <span className="text-xs text-muted-foreground">لا نتائج</span>
          )}
        </div>
      </div>

      {selected && progress.isLoading && (
        <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}
      {selected && progress.error && (
        <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">{(progress.error as any).message}</div>
      )}
      {selected && progress.data && (
        <>
          <ProgressSummary d={progress.data} />
          <Tabs defaultValue="audit">
            <TabsList>
              <TabsTrigger value="audit">تدقيق التخرج</TabsTrigger>
              <TabsTrigger value="eligibility">أهلية التخرج</TabsTrigger>
            </TabsList>
            <TabsContent value="audit" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button size="sm" variant="outline" onClick={() => exportAudit.mutate()} disabled={exportAudit.isPending}>
                  <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
                </Button>
              </div>
              <DegreeAudit d={progress.data} />
            </TabsContent>
            <TabsContent value="eligibility" className="mt-4">
              <EligibilityCard d={progress.data} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
