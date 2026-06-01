import { createFileRoute } from "@tanstack/react-router";
import { Database, Shield, CheckCircle2, AlertTriangle, FileWarning } from "lucide-react";

export const Route = createFileRoute("/admin/backup-status")({
  component: BackupStatusPage,
});

function BackupStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">حالة النسخ الاحتياطي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ملخّص خطّة النسخ الاحتياطي والاسترجاع. لا توجد بيانات تشغيلية مباشرة من المنصة في هذه الواجهة.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold">Manual Verification Required</div>
          <p className="mt-1 leading-6">
            بيانات حالة النسخ الاحتياطي وتاريخ آخر نسخة و PITR لا تتوفر مباشرة عبر الـ API.
            يجب التحقق منها يدوياً من إعدادات Lovable Cloud لمشروع البوابة.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card icon={Database} label="Backup Provider" value="Lovable Cloud (Supabase)" status="info" />
        <Card icon={Shield} label="Backup Frequency" value="يومي تلقائي" status="ok" />
        <Card icon={FileWarning} label="PITR Status" value="يحتاج تأكيد يدوي" status="warn" />
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">قائمة فحص الاسترجاع (Restore Checklist)</h2>
        <ol className="space-y-3 text-sm">
          <Step n={1}>
            تأكيد آخر تاريخ نسخ احتياطي ناجح من لوحة Cloud → Database → Backups.
          </Step>
          <Step n={2}>
            تأكيد تفعيل PITR (Point-In-Time Recovery) إن كان مطلوباً لخطة الإطلاق.
          </Step>
          <Step n={3}>
            تنفيذ سيناريو استرجاع تجريبي إلى مشروع منفصل قبل الإطلاق التجريبي.
          </Step>
          <Step n={4}>
            توثيق إجراء الاسترجاع والوقت المتوقع للاستعادة (RTO) وحدود فقد البيانات (RPO).
          </Step>
          <Step n={5}>
            التأكد من نسخ ملفات Storage (سندات الدفع ومرفقات الطلبات) ضمن استراتيجية النسخ.
          </Step>
          <Step n={6}>
            تحديد مسؤول مالك لإجراءات الاسترجاع في حالات الطوارئ.
          </Step>
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-3">سجل التحقق اليدوي</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>هذه الصفحة لا تحفظ بيانات. يرجى توثيق نتائج التحقق خارج النظام (Wiki/PDF داخلي) وتحديثها دورياً.</p>
          <ul className="list-disc pr-5 space-y-1">
            <li>تاريخ آخر اختبار استرجاع: <span className="font-mono">— غير مسجّل —</span></li>
            <li>مسؤول النسخ الاحتياطي: <span className="font-mono">— غير محدد —</span></li>
            <li>RTO المستهدف: <span className="font-mono">— غير محدد —</span></li>
            <li>RPO المستهدف: <span className="font-mono">— غير محدد —</span></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Card({ icon: Icon, label, value, status }: { icon: any; label: string; value: string; status: "ok" | "warn" | "info" }) {
  const colors =
    status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "warn" ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-border bg-card text-primary";
  return (
    <div className={`rounded-xl border p-5 ${colors}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-lg font-extrabold">{value}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-extrabold">{n}</span>
      <div className="flex-1 leading-7">
        <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-600 ml-1" />
        {children}
      </div>
    </li>
  );
}
