import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, BookOpen } from "lucide-react";
import {
  listPlansForProgram,
  previewPlanAssignmentTargets,
  assignStudentsStudyPlan,
} from "@/lib/student-plan-assignment.functions";

const selectCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function usePlansForProgram(programId: string | null | undefined) {
  const fn = useServerFn(listPlansForProgram);
  return useQuery({
    queryKey: ["admin-plans-for-program", programId],
    queryFn: () => fn({ data: { programId: programId! } }),
    enabled: !!programId,
  });
}

/** «الخطة الدراسية» select; "" = automatic (active plan of the program). */
export function StudyPlanSelect({
  programId, value, onChange,
}: { programId: string; value: string; onChange: (v: string) => void }) {
  const { data: plans = [], isLoading } = usePlansForProgram(programId || null);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} disabled={!programId || isLoading}>
      <option value="">تلقائي (الخطة الفعّالة للبرنامج)</option>
      {plans.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — إصدار {p.version}{p.is_active ? "" : " (معطلة)"}
        </option>
      ))}
    </select>
  );
}

type Lookups = {
  programs: Array<{ id: string; name_ar: string }>;
  levels: Array<{ id: string; name: string }>;
  academic_years: Array<{ id: string; name: string; is_current?: boolean | null }>;
};

export function BulkAssignPlanModal({ lookups, onClose, onDone }: {
  lookups: Lookups; onClose: () => void; onDone: (updated: number) => void;
}) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewPlanAssignmentTargets);
  const assignFn = useServerFn(assignStudentsStudyPlan);
  const [programId, setProgramId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [yearId, setYearId] = useState(
    lookups.academic_years.find((y) => y.is_current)?.id ?? lookups.academic_years[0]?.id ?? "",
  );
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = !!programId && !!levelId && !!yearId;
  const preview = useQuery({
    queryKey: ["admin-plan-bulk-preview", programId, levelId, yearId],
    queryFn: () => previewFn({ data: { programId, levelId, academicYearId: yearId } }),
    enabled: ready,
  });
  const count = preview.data?.studentIds.length ?? 0;

  const submit = async () => {
    if (!preview.data || !count) return;
    setBusy(true); setErr(null);
    try {
      const res = await assignFn({ data: { studentIds: preview.data.studentIds, studyPlanId: planId || null } });
      qc.invalidateQueries({ queryKey: ["admin-plan-assignment-counts"] });
      onDone(res.updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl shadow-2xl w-full max-w-lg" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-lg font-bold text-primary flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> تعيين خطة دراسية
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block space-y-1"><span className="text-xs font-bold text-muted-foreground">البرنامج</span>
            <select value={programId} onChange={(e) => { setProgramId(e.target.value); setPlanId(""); }} className={selectCls}>
              <option value="">— اختر —</option>
              {lookups.programs.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="text-xs font-bold text-muted-foreground">المستوى</span>
              <select value={levelId} onChange={(e) => setLevelId(e.target.value)} className={selectCls}>
                <option value="">— اختر —</option>
                {lookups.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1"><span className="text-xs font-bold text-muted-foreground">العام الدراسي</span>
              <select value={yearId} onChange={(e) => setYearId(e.target.value)} className={selectCls}>
                {lookups.academic_years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1"><span className="text-xs font-bold text-muted-foreground">الخطة الدراسية</span>
            <StudyPlanSelect programId={programId} value={planId} onChange={setPlanId} />
          </label>
          {ready && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
              {preview.isLoading ? "جارٍ حساب عدد الطلاب…" : (
                <>سيتأثر <span className="font-bold text-primary">{count}</span> طالباً
                  {preview.data?.alreadyAssigned ? ` (منهم ${preview.data.alreadyAssigned} لديهم خطة معيّنة حالياً)` : ""}.</>
              )}
            </div>
          )}
          {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-bold text-destructive">{err}</div>}
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2 bg-secondary/30">
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold">إلغاء</button>
          <button type="button" onClick={submit} disabled={busy || !count}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-bold disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التعيين
          </button>
        </div>
      </div>
    </div>
  );
}
