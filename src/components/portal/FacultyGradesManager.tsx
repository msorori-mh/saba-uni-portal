import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

type Section = { id: string; section_code: string; course_code: string; course_name: string };

export function FacultyGradesManager({ facultyProfileId, sections }: { facultyProfileId: string; sections: Section[] }) {
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newMax, setNewMax] = useState<string>("");

  const { data: components = [] } = useQuery({
    queryKey: ["fac-grade-components", sectionId],
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

  const { data: enrollments = [] } = useQuery({
    queryKey: ["fac-grade-enrollments", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("id, student:student_profiles(academic_number, full_name_ar)")
        .eq("course_section_id", sectionId)
        .eq("enrollment_status", "enrolled");
      if (error) throw error;
      type R = { id: string; student: { academic_number: string; full_name_ar: string } | null };
      return (data ?? []) as unknown as R[];
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["fac-grades", sectionId, enrollments.length],
    enabled: !!sectionId && enrollments.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.from("student_grades")
        .select("id, student_enrollment_id, grade_component_id, score, status")
        .in("student_enrollment_id", enrollments.map((e) => e.id));
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; student_enrollment_id: string; grade_component_id: string; score: number; status: string }[];
    },
  });

  // Local edit buffer { enrollment_id -> { component_id -> score string } }
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  const gradeFor = (en: string, cm: string) => grades.find((g) => g.student_enrollment_id === en && g.grade_component_id === cm);
  const isLocked = (en: string, cm: string) => {
    const g = gradeFor(en, cm);
    return g ? g.status !== "draft" : false;
  };

  const addComponent = async () => {
    const max = Number(newMax);
    if (!newName.trim() || !max || max <= 0) { toast.error("أدخل اسم ودرجة قصوى صحيحة"); return; }
    const { error } = await (sb.from("grade_components") as any).insert({
      course_section_id: sectionId, name: newName.trim(), max_score: max, sort_order: components.length + 1,
    });
    if (error) { toast.error(error.message); return; }
    setNewName(""); setNewMax("");
    qc.invalidateQueries({ queryKey: ["fac-grade-components", sectionId] });
  };

  const deleteComponent = async (id: string) => {
    if (!confirm("حذف هذا المكون؟")) return;
    const { error } = await sb.from("grade_components").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fac-grade-components", sectionId] });
    qc.invalidateQueries({ queryKey: ["fac-grades", sectionId] });
  };

  const saveDrafts = async (submit: boolean) => {
    const ops: Promise<any>[] = [];
    for (const [enId, comps] of Object.entries(edits)) {
      for (const [cmId, scoreStr] of Object.entries(comps)) {
        if (isLocked(enId, cmId)) continue;
        const score = Number(scoreStr);
        if (Number.isNaN(score)) continue;
        const existing = gradeFor(enId, cmId);
        const payload: any = { score, status: submit ? "submitted" : "draft", entered_by: facultyProfileId };
        if (existing) {
          ops.push((sb.from("student_grades") as any).update(payload).eq("id", existing.id));
        } else {
          ops.push((sb.from("student_grades") as any).insert({ student_enrollment_id: enId, grade_component_id: cmId, ...payload }));
        }
      }
    }
    // Also submit existing drafts that weren't edited
    if (submit) {
      for (const g of grades) {
        if (g.status === "draft") {
          const wasTouched = edits[g.student_enrollment_id]?.[g.grade_component_id];
          if (wasTouched === undefined) {
            ops.push((sb.from("student_grades") as any).update({ status: "submitted" }).eq("id", g.id));
          }
        }
      }
    }
    if (ops.length === 0) { toast.info("لا تغييرات للحفظ"); return; }
    const results = await Promise.all(ops);
    const errs = results.filter((r: any) => r.error);
    if (errs.length) { toast.error(errs[0].error.message); }
    else { toast.success(submit ? "تم الإرسال للاعتماد" : "تم حفظ المسودة"); setEdits({}); }
    qc.invalidateQueries({ queryKey: ["fac-grades", sectionId] });
  };

  const totalMax = components.reduce((s, c) => s + Number(c.max_score), 0);
  const sectionsOptions = sections;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <select className="w-full border rounded px-2 py-2 text-sm bg-background" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setEdits({}); }}>
        <option value="">اختر شعبة لإدارة درجاتها</option>
        {sectionsOptions.map((s) => (
          <option key={s.id} value={s.id}>{s.course_code} — {s.course_name} • شعبة {s.section_code}</option>
        ))}
      </select>

      {sectionId && (
        <>
          <div className="rounded border bg-muted/30 p-2.5">
            <div className="text-xs font-bold mb-2">مكونات الدرجة (المجموع الأقصى: <span className="font-mono">{totalMax}</span>/100)</div>
            {components.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {components.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 bg-card border px-2 py-0.5 rounded text-xs">
                    {c.name} <span className="font-mono text-muted-foreground">({c.max_score})</span>
                    <button onClick={() => deleteComponent(c.id)} className="text-destructive hover:opacity-80"><Trash2 className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input className="flex-1 border rounded px-2 py-1 text-xs" placeholder="اسم المكون" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="w-20 border rounded px-2 py-1 text-xs" placeholder="درجة قصوى" type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} />
              <button onClick={addComponent} className="inline-flex items-center gap-1 text-xs font-bold bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90"><Plus className="h-3 w-3" /> إضافة</button>
            </div>
          </div>

          {enrollments.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">لا يوجد طلاب مسجلون.</div>
          ) : components.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">أضف مكونات الدرجة أولاً.</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-1.5 text-right">الطالب</th>
                      {components.map((c) => <th key={c.id} className="p-1.5">{c.name}<div className="text-[10px] text-muted-foreground">/{c.max_score}</div></th>)}
                      <th className="p-1.5">المجموع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {enrollments.map((e) => {
                      let sum = 0;
                      return (
                        <tr key={e.id}>
                          <td className="p-1.5">
                            <div className="font-mono text-[10px] text-muted-foreground">{e.student?.academic_number}</div>
                            <div className="font-semibold">{e.student?.full_name_ar}</div>
                          </td>
                          {components.map((c) => {
                            const g = gradeFor(e.id, c.id);
                            const locked = g ? g.status !== "draft" : false;
                            const edited = edits[e.id]?.[c.id];
                            const value = edited ?? (g ? String(g.score) : "");
                            if (value !== "") sum += Number(value);
                            return (
                              <td key={c.id} className="p-1 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={c.max_score}
                                  step="0.5"
                                  disabled={locked}
                                  value={value}
                                  onChange={(ev) => setEdits((prev) => ({ ...prev, [e.id]: { ...(prev[e.id] ?? {}), [c.id]: ev.target.value } }))}
                                  className={`w-16 border rounded px-1 py-0.5 text-center font-mono ${locked ? "bg-muted text-muted-foreground" : ""}`}
                                  title={g ? `الحالة: ${g.status}` : ""}
                                />
                              </td>
                            );
                          })}
                          <td className="p-1.5 text-center font-mono font-bold">{sum}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => saveDrafts(false)} className="inline-flex items-center gap-1 text-xs font-bold border rounded px-2.5 py-1.5 hover:bg-muted">
                  <Save className="h-3.5 w-3.5" /> حفظ كمسودة
                </button>
                <button onClick={() => saveDrafts(true)} className="inline-flex items-center gap-1 text-xs font-bold bg-primary text-primary-foreground rounded px-2.5 py-1.5 hover:opacity-90">
                  <Send className="h-3.5 w-3.5" /> إرسال للاعتماد
                </button>
              </div>
              <div className="text-[10px] text-muted-foreground text-center">
                بعد الإرسال، الخلايا تصبح للقراءة فقط. ما زال بإمكانك تعديل المسودة قبل الاعتماد.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
