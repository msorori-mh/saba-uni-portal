import { CheckCircle2, AlertTriangle, XCircle, CircleDashed, GraduationCap, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { standingLabel, standingTone } from "@/lib/academic-status";
import { COURSE_PASS_PERCENT } from "@/lib/academic/pass-threshold";
import type { StudentProgressDTO } from "@/lib/academic-status.functions";

const STAT_ICONS = { completed: CheckCircle2, in_progress: CircleDashed, failed: XCircle, missing: AlertTriangle };
const STAT_LABELS: Record<string, string> = {
  completed: "مجتاز", in_progress: "قيد الدراسة", failed: "راسب", missing: "غير مأخوذ",
};
const STAT_COLORS: Record<string, string> = {
  completed: "text-emerald-600",
  in_progress: "text-blue-600",
  failed: "text-red-600",
  missing: "text-amber-600",
};

export function ProgressSummary({ d }: { d: StudentProgressDTO }) {
  const tone = standingTone(d.standing.standing);
  const toneClass =
    tone === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "warn" ? "bg-amber-50 text-amber-700 border-amber-200"
    : tone === "bad" ? "bg-red-50 text-red-700 border-red-200"
    : "bg-sky-50 text-sky-700 border-sky-200";

  return (
    <div className="space-y-5">
      {/* Student summary */}
      <div className="rounded-2xl border border-border bg-card shadow-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-lg font-extrabold text-primary">{d.student.full_name_ar}</div>
              <div className="text-xs text-muted-foreground font-mono">{d.student.academic_number}</div>
            </div>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", toneClass)}>
            <BadgeCheck className="inline h-3 w-3 ml-1" /> {standingLabel(d.standing.standing)}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 mt-4 text-sm">
          <Info label="البرنامج" value={d.student.program ?? "—"} />
          <Info label="القسم" value={d.student.department ?? "—"} />
          <Info label="المستوى" value={d.student.level ?? "غير محدد"} />
          <Info label="الحالة" value={d.student.status_label} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{d.standing.reason}</p>
      </div>

      {/* Progress cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="إجمالي الساعات" value={d.progress.total_plan_hours} />
        <Stat label="الساعات المكتسبة" value={d.progress.completed_hours} accent="ok" />
        <Stat label="الساعات المتبقية" value={d.progress.remaining_hours} accent="warn" />
        <Stat label="نسبة الإنجاز" value={`${d.progress.completion_percentage}%`} accent="info" />
        <Stat label="النتيجة الفصلية" value={`${d.progress.current_official_average.toFixed(1)}%`} />
        <Stat label="النتيجة التراكمية" value={`${d.progress.cumulative_official_average.toFixed(1)}%`} accent={d.progress.cumulative_official_average >= COURSE_PASS_PERCENT ? "ok" : "bad"} />
      </div>

      {/* Course mix */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="مقررات مجتازة" value={d.progress.passed_courses} accent="ok" />
        <Stat label="قيد الدراسة" value={d.progress.in_progress_courses} accent="info" />
        <Stat label="رسوب" value={d.progress.failed_courses} accent="bad" />
        <Stat label="مقررات معادة" value={d.progress.repeated_courses} accent="warn" />
      </div>
    </div>
  );
}

export function DegreeAudit({ d }: { d: StudentProgressDTO }) {
  const groups = new Map<string, typeof d.audit.courses>();
  for (const c of d.audit.courses) {
    const k = c.level ?? "أخرى";
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([level, items]) => (
        <div key={level} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-sm font-bold text-primary border-b">{level}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20">
                <tr>
                  <th className="px-2 py-2 text-right">المقرر</th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-center">س.م</th>
                  <th className="px-2 py-2 text-center">النوع</th>
                  <th className="px-2 py-2 text-center">المحاولات</th>
                  <th className="px-2 py-2 text-center">النتيجة الرسمية</th>
                  <th className="px-2 py-2 text-center">التقدير</th>
                  <th className="px-2 py-2 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const Icon = STAT_ICONS[c.status];
                  return (
                    <tr key={c.course_id} className="border-t">
                      <td className="px-2 py-2 font-mono">{c.code}</td>
                      <td className="px-2 py-2">{c.name_ar}</td>
                      <td className="px-2 py-2 text-center">{c.credit_hours}</td>
                      <td className="px-2 py-2 text-center">{c.is_required ? "إجباري" : "اختياري"}</td>
                      <td className="px-2 py-2 text-center">{c.attempts || "—"}</td>
                      <td className="px-2 py-2 text-center">{c.official_result != null ? c.official_result.toFixed(1) : "—"}</td>
                      <td className="px-2 py-2 text-center">{c.grade_label ?? "—"}</td>
                      <td className={cn("px-2 py-2 text-center font-bold", STAT_COLORS[c.status])}>
                        <Icon className="inline h-3.5 w-3.5 ml-1" /> {STAT_LABELS[c.status]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EligibilityCard({ d }: { d: StudentProgressDTO }) {
  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border p-4",
        d.eligibility.eligible ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
        <div className="flex items-center gap-3">
          {d.eligibility.eligible
            ? <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            : <XCircle className="h-7 w-7 text-red-600" />}
          <div>
            <div className="font-display text-lg font-extrabold">
              {d.eligibility.eligible ? "✅ مؤهل للتخرج" : "❌ غير مؤهل للتخرج"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              متبقي: {d.eligibility.missing_hours} ساعة · مقررات إجبارية ناقصة: {d.eligibility.missing_required_courses.length}
            </div>
          </div>
        </div>
      </div>

      {d.eligibility.missing_graduation_requirements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-card p-4">
          <div className="font-bold text-primary mb-2">أسباب عدم الأهلية</div>
          <ul className="list-disc pr-5 space-y-1 text-sm">
            {d.eligibility.missing_graduation_requirements.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {d.eligibility.warnings.length > 0 && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
          <div className="font-bold text-amber-800 mb-2">تنبيهات</div>
          <ul className="list-disc pr-5 space-y-1 text-sm text-amber-900">
            {d.eligibility.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {d.eligibility.missing_required_courses.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-sm font-bold text-primary border-b">المقررات الإجبارية الناقصة</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20">
                <tr><th className="px-2 py-2 text-right">الرمز</th><th className="px-2 py-2 text-right">الاسم</th><th className="px-2 py-2 text-center">الساعات</th></tr>
              </thead>
              <tbody>
                {d.eligibility.missing_required_courses.map((c) => (
                  <tr key={c.code} className="border-t">
                    <td className="px-2 py-2 font-mono">{c.code}</td>
                    <td className="px-2 py-2">{c.name_ar}</td>
                    <td className="px-2 py-2 text-center">{c.credit_hours}</td>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold text-sm truncate">{value}</div>
    </div>
  );
}
function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "ok" | "warn" | "bad" | "info" }) {
  const accentCls =
    accent === "ok" ? "text-emerald-700"
    : accent === "warn" ? "text-amber-700"
    : accent === "bad" ? "text-red-700"
    : accent === "info" ? "text-sky-700" : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("font-display text-2xl font-extrabold mt-1", accentCls)}>{value}</div>
    </div>
  );
}
