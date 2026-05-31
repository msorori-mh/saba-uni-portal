import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, CheckCircle2, RotateCcw, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Cast helper: new tables not in generated types yet
const sb = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

export const Route = createFileRoute("/admin/grades")({
  component: AdminGradesPage,
});

type SectionOption = {
  id: string;
  section_code: string;
  course_code: string;
  course_name: string;
  year_name: string;
  semester_name: string;
};

async function fetchSections(filters: { yearId?: string; semId?: string }): Promise<SectionOption[]> {
  let q = supabase
    .from("course_sections")
    .select("id, section_code, offering:course_offerings(academic_year_id, semester_id, course:courses(code, name_ar), academic_year:academic_years(name), semester:semesters(name))")
    .eq("status", "active");
  const { data, error } = await q;
  if (error) throw error;
  type Raw = {
    id: string; section_code: string;
    offering: {
      academic_year_id: string; semester_id: string;
      course: { code: string; name_ar: string } | null;
      academic_year: { name: string } | null;
      semester: { name: string } | null;
    } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((r) => !filters.yearId || r.offering?.academic_year_id === filters.yearId)
    .filter((r) => !filters.semId || r.offering?.semester_id === filters.semId)
    .map((r) => ({
      id: r.id,
      section_code: r.section_code,
      course_code: r.offering?.course?.code ?? "—",
      course_name: r.offering?.course?.name_ar ?? "—",
      year_name: r.offering?.academic_year?.name ?? "",
      semester_name: r.offering?.semester?.name ?? "",
    }));
}

function AdminGradesPage() {
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState<string>("");
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [returnNote, setReturnNote] = useState<string>("");

  const { data: years = [] } = useQuery({
    queryKey: ["adm-grades-years"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_years").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: sems = [] } = useQuery({
    queryKey: ["adm-grades-sems", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data } = await supabase.from("semesters").select("id, name").eq("academic_year_id", yearId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: sections = [], isLoading: secLoading } = useQuery({
    queryKey: ["adm-grades-sections", yearId, semId],
    queryFn: () => fetchSections({ yearId, semId }),
  });

  const { data: components = [] } = useQuery({
    queryKey: ["adm-grades-components", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await sb.from("grade_components")
        .select("id, name, max_score, sort_order")
        .eq("course_section_id", sectionId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; name: string; max_score: number; sort_order: number }[];
    },
  });

  const { data: rows = [], isLoading: gradesLoading } = useQuery({
    queryKey: ["adm-grades-rows", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data: enrolls, error: e1 } = await supabase
        .from("student_enrollments")
        .select("id, student:student_profiles(academic_number, full_name_ar)")
        .eq("course_section_id", sectionId);
      if (e1) throw e1;
      type EnRaw = { id: string; student: { academic_number: string; full_name_ar: string } | null };
      const enr = (enrolls ?? []) as unknown as EnRaw[];
      const { data: gs, error: e2 } = await sb.from("student_grades")
        .select("id, student_enrollment_id, grade_component_id, score, status, approved_at")
        .in("student_enrollment_id", enr.map((e) => e.id));
      if (e2) throw e2;
      type GR = { id: string; student_enrollment_id: string; grade_component_id: string; score: number; status: string; approved_at: string | null };
      const grades = (gs ?? []) as unknown as GR[];
      return enr.map((e) => {
        const gByComp: Record<string, GR | undefined> = {};
        for (const g of grades) if (g.student_enrollment_id === e.id) gByComp[g.grade_component_id] = g;
        return { enrollmentId: e.id, academic_number: e.student?.academic_number ?? "—", name: e.student?.full_name_ar ?? "—", grades: gByComp };
      });
    },
  });

  const totalMax = components.reduce((s, c) => s + Number(c.max_score), 0);

  const approveAll = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: staff } = await supabase.from("staff_profiles").select("id").eq("user_id", auth.user!.id).maybeSingle();
    const idsToApprove: string[] = [];
    for (const r of rows) for (const g of Object.values(r.grades)) if (g && g.status === "submitted") idsToApprove.push(g.id);
    if (idsToApprove.length === 0) {
      toast.info("لا توجد درجات بحالة (مرسلة) للاعتماد");
      return;
    }
    const { error } = await sb.from("student_grades")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: staff?.id ?? null })
      .in("id", idsToApprove);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم اعتماد ${idsToApprove.length} درجة`);
    qc.invalidateQueries({ queryKey: ["adm-grades-rows", sectionId] });
  };

  const returnAll = async () => {
    const idsToReturn: string[] = [];
    for (const r of rows) for (const g of Object.values(r.grades)) if (g && g.status === "submitted") idsToReturn.push(g.id);
    if (idsToReturn.length === 0) { toast.info("لا توجد درجات للإرجاع"); return; }
    const { error } = await sb.from("student_grades")
      .update({ status: "draft" })
      .in("id", idsToReturn);
    if (error) { toast.error(error.message); return; }
    toast.success(`أُعيدت ${idsToReturn.length} درجة للتعديل${returnNote ? " — ملاحظة مسجّلة" : ""}`);
    setReturnNote("");
    qc.invalidateQueries({ queryKey: ["adm-grades-rows", sectionId] });
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
          <option value="">اختر شعبة</option>
          {secLoading ? <option>...</option> : sections.map((s) => (
            <option key={s.id} value={s.id}>{s.course_code} — {s.course_name} • شعبة {s.section_code}</option>
          ))}
        </select>
      </div>

      {!sectionId ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          اختر شعبة لعرض درجاتها
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
              <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد طلاب مسجلون في هذه الشعبة</div>
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
