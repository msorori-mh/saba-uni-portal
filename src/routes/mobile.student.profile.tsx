import { createFileRoute } from "@tanstack/react-router";
import { Loader2, UserRound } from "lucide-react";
import {
  STUDENT_STATUS_LABELS_AR,
  STUDY_SYSTEM_LABELS_AR,
  useMobileStudentContext,
} from "@/lib/mobile/student-context";

export const Route = createFileRoute("/mobile/student/profile")({
  head: () => ({ meta: [{ title: "الملف الشخصي" }] }),
  component: MobileStudentProfile,
});

/** READ-ONLY: the mobile app never edits identity data. */
function MobileStudentProfile() {
  const { data, isLoading } = useMobileStudentContext();
  const p = data?.profile ?? null;

  const rows: { label: string; value: string; ltr?: boolean }[] = p
    ? [
        { label: "الاسم", value: p.full_name_ar ?? "—" },
        { label: "الرقم الأكاديمي", value: p.academic_number ?? "—", ltr: true },
        { label: "القسم", value: p.department?.name_ar ?? "—" },
        { label: "البرنامج", value: p.program?.name_ar ?? "—" },
        {
          label: "المستوى",
          value: data?.levelNumber ? `المستوى ${data.levelNumber}` : "—",
        },
        {
          label: "نظام الدراسة",
          value: p.study_system ? STUDY_SYSTEM_LABELS_AR[p.study_system] ?? p.study_system : "—",
        },
        {
          label: "الحالة",
          value: p.status ? STUDENT_STATUS_LABELS_AR[p.status] ?? p.status : "—",
        },
        { label: "البريد الإلكتروني", value: p.email ?? "—", ltr: true },
        { label: "رقم الهاتف", value: p.phone ?? "—", ltr: true },
      ]
    : [];

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <UserRound className="h-5 w-5 text-gold" /> الملف الشخصي
      </h1>

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !p ? (
        <p className="text-sm text-muted-foreground">تعذر تحميل بيانات الملف الشخصي.</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-[11px] font-bold text-muted-foreground">{r.label}</span>
                <span
                  dir={r.ltr ? "ltr" : undefined}
                  className={`text-[13px] font-extrabold text-primary ${r.ltr ? "font-mono" : ""}`}
                >
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            هذه البيانات للعرض فقط. لتعديل أي بيان، راجع شؤون الطلاب في الكلية.
          </p>
        </>
      )}
    </div>
  );
}
