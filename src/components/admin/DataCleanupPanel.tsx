import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDataCleanupPreview, runDataCleanup, CLEANUP_SCOPE_LABELS,
  type CleanupScope, type CleanupPreview,
} from "@/lib/admin-data-cleanup.functions";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";

const CLEANUP_TABLE_LABELS: Record<string, string> = {
  student_enrollments: "تسجيلات المقررات",
  student_grades: "الدرجات",
  student_requests: "طلبات الطلاب",
  student_request_attachments: "مرفقات الطلبات",
  student_fees: "رسوم الطلاب",
  student_payments: "مدفوعات",
  payment_receipts: "سندات الدفع",
  student_discounts: "خصومات",
  student_fee_adjustments: "تعديلات الرسوم",
  official_documents: "وثائق رسمية",
  student_academic_status: "الحالة الأكاديمية",
  class_schedule: "الجدول الدراسي",
  grade_components: "مكونات الدرجات",
  course_sections: "المجموعات",
  course_offerings: "عروض المقررات",
  student_profiles: "ملفات الطلاب",
  auth_users: "حسابات مصادقة",
  user_roles: "أدوار طلاب",
  user_role_assignments: "تعيينات الأدوار",
  notifications: "إشعارات",
  announcement_reads: "قراءات الإعلانات",
  internal_messages: "رسائل داخلية",
};

const PRESERVED_LABELS: Record<string, string> = {
  programs: "البرامج",
  courses: "المقررات",
  departments: "الأقسام",
  academic_years: "السنوات الأكاديمية",
  semesters: "الفصول",
  study_plans: "الخطط الدراسية",
  faculty_profiles: "هيئة التدريس",
  staff_profiles: "الموظفون",
  student_profiles: "ملفات الطلاب (محفوظة)",
};

export function DataCleanupPanel() {
  const qc = useQueryClient();
  const previewFn = useServerFn(getDataCleanupPreview);
  const cleanupFn = useServerFn(runDataCleanup);
  const [scope, setScope] = useState<CleanupScope>("transactional");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [result, setResult] = useState<{ deleted: Record<string, number> } | null>(null);

  const preview = useQuery({
    queryKey: ["data-cleanup-preview", scope],
    queryFn: () => previewFn({ data: { scope } }),
    staleTime: 15_000,
  });

  const runMut = useMutation({
    mutationFn: () => cleanupFn({ data: { scope, confirmPhrase } }),
    onSuccess: (res) => {
      setResult(res);
      setConfirmPhrase("");
      qc.invalidateQueries({ queryKey: ["data-cleanup-preview"] });
      qc.invalidateQueries({ queryKey: ["operations-overview"] });
    },
  });

  const meta = CLEANUP_SCOPE_LABELS[scope];
  const p = preview.data as CleanupPreview | undefined;
  const deleteTotal = p ? Object.values(p.toDelete).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold">تحضير البيانات قبل الفصل الأكاديمي 2026-2027</div>
          <p className="mt-1 leading-6">
            هذه العملية لا تمس البرامج أو المقررات أو هيئة التدريس. يُنصح بأخذ نسخة احتياطية قبل التنفيذ.
            بعد التنظيف، انتقل إلى{" "}
            <Link to="/admin/pilot-center" className="font-bold underline">مركز التشغيل التجريبي</Link>
            {" "}لتشغيل سيناريوهات الاختبار.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(CLEANUP_SCOPE_LABELS) as CleanupScope[]).map((s) => {
          const m = CLEANUP_SCOPE_LABELS[s];
          const active = scope === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => { setScope(s); setResult(null); setConfirmPhrase(""); }}
              className={cn(
                "rounded-xl border p-4 text-right transition-all",
                active ? "border-gold bg-card shadow-card ring-1 ring-gold/30" : "border-border bg-card/50 hover:bg-card",
              )}
            >
              <div className="font-display text-sm font-bold text-primary">{m.title}</div>
              <p className="mt-2 text-xs text-muted-foreground leading-5">{m.description}</p>
            </button>
          );
        })}
      </div>

      {preview.isLoading ? (
        <div className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin me-2" />جاري حساب المعاينة...</div>
      ) : preview.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{(preview.error as Error).message}</div>
      ) : p ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> سيُحذف ({deleteTotal} سجل)
            </h2>
            <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto">
              {Object.entries(p.toDelete)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{CLEANUP_TABLE_LABELS[k] ?? k}</span>
                    <span className="font-mono font-bold">{n}</span>
                  </li>
                ))}
              {deleteTotal === 0 && <li className="text-emerald-700">لا توجد سجلات للحذف في هذا النطاق.</li>}
            </ul>
          </section>
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <h2 className="font-display text-base font-bold text-emerald-800 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> يُحفظ
            </h2>
            <ul className="space-y-1.5 text-sm">
              {Object.entries(p.preserved).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>{PRESERVED_LABELS[k] ?? k}</span>
                  <span className="font-mono font-bold">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
        <div className="text-sm font-bold text-primary">تأكيد التنفيذ</div>
        <p className="text-xs text-muted-foreground">
          اكتب العبارة التالية للتأكيد: <span className="font-mono font-bold text-primary">{meta.confirm}</span>
        </p>
        <input
          value={confirmPhrase}
          onChange={(e) => setConfirmPhrase(e.target.value)}
          placeholder={meta.confirm}
          className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
          dir="rtl"
        />
        <button
          type="button"
          disabled={runMut.isPending || confirmPhrase.trim() !== meta.confirm || deleteTotal === 0}
          onClick={() => runMut.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {runMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          تنفيذ {meta.title}
        </button>
        {runMut.error && (
          <div className="text-sm text-destructive">{(runMut.error as Error).message}</div>
        )}
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="inline h-4 w-4 me-1" />
            اكتمل التنظيف. راجع سجل التدقيق للتفاصيل.
          </div>
        )}
      </section>
    </div>
  );
}
