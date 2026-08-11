import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { getBackupStatusOverview } from "@/lib/admin-backup-status.functions";
import { LoadErrorNotice } from "@/components/admin/AccessDeniedNotice";
import { BackupMetricsPanel } from "@/components/admin/backup/BackupMetricsPanel";
import { BackupVerificationLog } from "@/components/admin/backup/BackupVerificationLog";
import { formatDateTime, resultLabel } from "@/components/admin/backup/backup-format";

const VERIFICATION_MAX_AGE_DAYS = 30;

export const Route = createFileRoute("/admin/backup-status")({
  component: BackupStatusPage,
});

function BackupStatusPage() {
  const overviewFn = useServerFn(getBackupStatusOverview);
  const overviewQ = useQuery({
    queryKey: ["backup-overview"],
    queryFn: () => overviewFn(),
  });

  if (overviewQ.isError) {
    return <LoadErrorNotice error={overviewQ.error} onRetry={() => overviewQ.refetch()} />;
  }

  const overview = overviewQ.data;
  const days = overview?.daysSinceLastVerification ?? null;
  const last = overview?.lastVerification ?? null;

  const state: "ok" | "due" | "never" | "failed" =
    !last
      ? "never"
      : last.result === "fail"
        ? "failed"
        : days !== null && days > VERIFICATION_MAX_AGE_DAYS
          ? "due"
          : "ok";

  const banner = {
    ok: {
      icon: CheckCircle2,
      tone: "border-success/40 bg-success/10 text-success",
      title: "التحقق محدّث",
      body: `آخر عملية تحقق (${resultLabel(last?.result ?? "")}) بتاريخ ${formatDateTime(last?.verifiedAt ?? null)}${
        last?.performedByName ? ` — بواسطة ${last.performedByName}` : ""
      }.`,
    },
    due: {
      icon: Clock,
      tone: "border-warning/40 bg-warning/10 text-warning",
      title: "التحقق متأخر",
      body: `مضى ${days} يوماً على آخر تحقق. الحد الموصى به ${VERIFICATION_MAX_AGE_DAYS} يوماً.`,
    },
    never: {
      icon: AlertTriangle,
      tone: "border-warning/40 bg-warning/10 text-warning",
      title: "لم يُسجَّل أي تحقق بعد",
      body: "سجّل أول عملية تحقق من النسخ الاحتياطي لبدء متابعة الجاهزية.",
    },
    failed: {
      icon: AlertTriangle,
      tone: "border-destructive/40 bg-destructive/10 text-destructive",
      title: "آخر عملية تحقق فاشلة",
      body: `فشل التحقق بتاريخ ${formatDateTime(last?.verifiedAt ?? null)}. تجب المعالجة قبل اعتماد الجاهزية.`,
    },
  }[state];

  const BannerIcon = banner.icon;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">حالة النسخ الاحتياطي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مؤشرات فعلية من قاعدة البيانات والتخزين، مع سجل تحقق يدوي موثّق لعمليات النسخ والاسترجاع.
        </p>
      </div>

      {overviewQ.isLoading || !overview ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ قراءة مؤشرات النظام…
        </div>
      ) : (
        <>
          <div className={`rounded-xl border p-5 text-sm flex items-start gap-3 ${banner.tone}`}>
            <BannerIcon className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">{banner.title}</div>
              <p className="mt-1 leading-6">{banner.body}</p>
            </div>
          </div>

          <BackupMetricsPanel overview={overview} />

          <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground leading-6">
            تاريخ آخر نسخة احتياطية ناجحة وحالة الاسترجاع الزمني (PITR) لا تتوفران عبر واجهة
            برمجية، ويجب تأكيدهما يدوياً من إعدادات المنصة ثم تسجيل النتيجة في السجل أدناه. كل ما
            يظهر أعلاه مقروء فعلياً من قاعدة الإنتاج بتاريخ {formatDateTime(overview.generatedAt)}.
          </div>

          <BackupVerificationLog />
        </>
      )}
    </div>
  );
}
