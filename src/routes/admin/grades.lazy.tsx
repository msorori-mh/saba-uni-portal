import { createLazyFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, CheckCircle2, RotateCcw, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getGradesLookups,
  listGradeSections,
  getSectionGradesGrid,
  approveSubmittedGrades,
  returnSubmittedGrades,
} from "@/lib/admin-grades.functions";
import { sendNotificationEmail } from "@/lib/email.functions";

export const Route = createLazyFileRoute("/admin/grades")({
  component: AdminGradesPage,
});

function AdminGradesPage() {
  usePagePerf("/admin/grades");
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getGradesLookups);
  const sectionsFn = useServerFn(listGradeSections);
  const gridFn = useServerFn(getSectionGradesGrid);
  const approveFn = useServerFn(approveSubmittedGrades);
  const returnFn = useServerFn(returnSubmittedGrades);
  const [sectionId, setSectionId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [returnNote, setReturnNote] = useState<string>("");

  const { data: years = [] } = useQuery({
    queryKey: ["adm-grades-years"],
    queryFn: async () => {
      const res = await lookupsFn({ data: {} });
      return res.years;
    },
  });
  const { data: sems = [] } = useQuery({
    queryKey: ["adm-grades-sems", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const res = await lookupsFn({ data: { yearId } });
      return res.semesters;
    },
  });
  const { data: sections = [], isLoading: secLoading } = useQuery({
    queryKey: ["adm-grades-sections", yearId, semId],
    queryFn: () => sectionsFn({
      data: {
        yearId: yearId || undefined,
        semesterId: semId || undefined,
      },
    }),
  });

  const { data: grid, isLoading: gradesLoading } = useQuery({
    queryKey: ["adm-grades-rows", sectionId],
    enabled: !!sectionId,
    queryFn: () => gridFn({ data: { sectionId } }),
  });
  const components = grid?.components ?? [];
  const rows = grid?.rows ?? [];

  const totalMax = components.reduce((s, c) => s + Number(c.max_score), 0);

  const approveAll = async () => {
    const idsToApprove: string[] = [];
    for (const r of rows) for (const g of Object.values(r.grades)) if (g && g.status === "submitted") idsToApprove.push(g.id);
    if (idsToApprove.length === 0) {
      toast.info("لا توجد درجات بحالة (مرسلة) للاعتماد");
      return;
    }
    try {
      const result = await approveFn({ data: { gradeIds: idsToApprove, sectionId } });
      if (result.approvedCount === 0) {
        toast.info("لا توجد درجات بحالة (مرسلة) للاعتماد");
        return;
      }
      toast.success(`تم اعتماد ${result.approvedCount} درجة`);
      qc.invalidateQueries({ queryKey: ["adm-grades-rows", sectionId] });
      for (const t of result.emailTargets) {
        sendNotificationEmail({ data: {
          templateKey: "grade_approved",
          recipientEmail: t.email,
          recipientName: t.full_name_ar,
          variables: { course_name: result.courseName },
          relatedEntityType: "course_section",
          relatedEntityId: sectionId,
        } }).catch(() => undefined);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const returnAll = async () => {
    const idsToReturn: string[] = [];
    for (const r of rows) for (const g of Object.values(r.grades)) if (g && g.status === "submitted") idsToReturn.push(g.id);
    if (idsToReturn.length === 0) { toast.info("لا توجد درجات للإرجاع"); return; }
    try {
      const result = await returnFn({ data: { gradeIds: idsToReturn } });
      if (result.returnedCount === 0) { toast.info("لا توجد درجات للإرجاع"); return; }
      toast.success(`أُعيدت ${result.returnedCount} درجة للتعديل${returnNote ? " — ملاحظة مسجّلة" : ""}`);
      setReturnNote("");
      qc.invalidateQueries({ queryKey: ["adm-grades-rows", sectionId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submittedCount = useMemo(() => {
    let n = 0;
    for (const r of rows) for (const g of Object.values(r.grades)) if (g?.status === "submitted") n++;
    return n;
  }, [rows]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-gold" />
        <h1 className="font-display text-xl font-extrabold text-primary">إدارة الدرجات والاعتماد</h1>
      </div>

      <div className="rounded-lg border bg-card p-3 grid gap-2 sm:grid-cols-3">
        <select className="border rounded px-2 py-2 text-sm bg-background" value={yearId} onChange={(e) => { setYearId(e.target.value); setSemId(""); setSectionId(""); }}>
          <option value="">كل السنوات الأكاديمية</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded px-2 py-2 text-sm bg-background" value={semId} onChange={(e) => { setSemId(e.target.value); setSectionId(""); }} disabled={!yearId}>
          <option value="">كل الفصول</option>
          {sems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="border rounded px-2 py-2 text-sm bg-background" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">اختر مجموعة دراسية</option>
          {secLoading ? <option>...</option> : sections.map((s) => (
            <option key={s.id} value={s.id}>{s.course_code} — {s.course_name} • مجموعة دراسية {s.section_code}</option>
          ))}
        </select>
      </div>

      {!sectionId ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          اختر مجموعة دراسية لعرض درجاتها
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
            <div className="text-xs">
              <span className="font-bold">المكونات: </span>
              {components.length === 0 ? <span className="text-muted-foreground">لا توجد مكونات</span> :
                components.map((c) => (
                  <span key={c.id} className="ms-1 inline-block bg-muted px-1.5 py-0.5 rounded">{c.name} ({c.max_score})</span>
                ))}
              <span className="ms-2 text-muted-foreground">— المجموع الأقصى: <span className="font-mono font-bold">{totalMax}</span></span>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <input
                type="text"
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                placeholder="ملاحظة الإرجاع (اختياري)"
                className="border rounded px-2 py-1.5 text-xs w-48"
              />
              <button onClick={returnAll} disabled={submittedCount === 0} className="inline-flex items-center gap-1 text-xs font-bold border rounded px-2.5 py-1.5 hover:bg-muted disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> إرجاع للتعديل
              </button>
              <button onClick={approveAll} disabled={submittedCount === 0} className="inline-flex items-center gap-1 text-xs font-bold bg-primary text-primary-foreground rounded px-2.5 py-1.5 hover:opacity-90 disabled:opacity-50">
                <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد المرسلة ({submittedCount})
              </button>
            </div>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            {gradesLoading ? (
              <div className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد طلاب مسجلون في هذه المجموعات الدراسيةة</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="p-2 text-right">الرقم الأكاديمي</th>
                    <th className="p-2 text-right">الاسم</th>
                    {components.map((c) => <th key={c.id} className="p-2">{c.name}<div className="text-[10px] text-muted-foreground">/{c.max_score}</div></th>)}
                    <th className="p-2">المجموع</th>
                    <th className="p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    let sum = 0; let statuses = new Set<string>();
                    for (const c of components) {
                      const g = r.grades[c.id];
                      if (g) { sum += Number(g.score); statuses.add(g.status); }
                    }
                    const overall = statuses.has("draft") || statuses.size === 0 ? "draft"
                      : statuses.has("submitted") ? "submitted" : "approved";
                    const stCls = overall === "approved" ? "bg-emerald-100 text-emerald-800" : overall === "submitted" ? "bg-amber-100 text-amber-800" : "bg-muted";
                    return (
                      <tr key={r.enrollmentId}>
                        <td className="p-2 font-mono text-xs">{r.academic_number}</td>
                        <td className="p-2 font-semibold">{r.name}</td>
                        {components.map((c) => {
                          const g = r.grades[c.id];
                          return <td key={c.id} className="p-2 text-center font-mono">{g ? Number(g.score) : "—"}</td>;
                        })}
                        <td className="p-2 text-center font-mono font-bold">{sum}/{totalMax}</td>
                        <td className="p-2 text-center"><span className={`text-[10px] px-2 py-0.5 rounded ${stCls}`}>{overall === "approved" ? "معتمد" : overall === "submitted" ? "مرسل" : "مسودة"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
