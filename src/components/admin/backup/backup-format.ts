import type { BackupCheckKind, BackupResult } from "@/lib/admin-backup-status.functions";

export const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: "last_successful_backup", label: "تأكيد آخر نسخة احتياطية ناجحة من إعدادات المنصة." },
  { id: "pitr_enabled", label: "تأكيد تفعيل الاسترجاع الزمني (PITR) إن كان مطلوباً." },
  { id: "restore_drill", label: "تنفيذ سيناريو استرجاع تجريبي إلى بيئة منفصلة." },
  { id: "rto_rpo_documented", label: "توثيق زمن الاستعادة المستهدف (RTO) وحد فقد البيانات (RPO)." },
  { id: "storage_coverage", label: "التأكد من شمول ملفات التخزين (المرفقات والسندات والوثائق)." },
  { id: "owner_assigned", label: "تحديد مسؤول مالك لإجراءات الاسترجاع في الطوارئ." },
];

export function checkKindLabel(kind: BackupCheckKind | string): string {
  switch (kind) {
    case "backup_snapshot":
      return "نسخة احتياطية";
    case "pitr":
      return "الاسترجاع الزمني (PITR)";
    case "restore_drill":
      return "اختبار استرجاع";
    case "storage_coverage":
      return "شمول ملفات التخزين";
    default:
      return String(kind);
  }
}

export function resultLabel(result: BackupResult | string): string {
  switch (result) {
    case "pass":
      return "ناجح";
    case "pass_with_notes":
      return "ناجح مع ملاحظات";
    case "fail":
      return "فاشل";
    default:
      return String(result);
  }
}

export function resultTone(result: BackupResult | string): string {
  if (result === "fail") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (result === "pass_with_notes") return "border-warning/40 bg-warning/10 text-warning";
  return "border-success/40 bg-success/10 text-success";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 بايت";
  const units = ["بايت", "كيلوبايت", "ميغابايت", "غيغابايت", "تيرابايت"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
  }).format(d);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ar", { numberingSystem: "latn" }).format(n);
}

export function bucketLabel(bucketId: string): string {
  switch (bucketId) {
    case "student-request-attachments":
      return "مرفقات طلبات الطلاب";
    case "student-request-secure-attachments":
      return "المرفقات الآمنة للطلبات";
    case "official-documents":
      return "الوثائق الرسمية";
    case "graduation-projects":
      return "مشاريع التخرج";
    case "faculty-images":
      return "صور أعضاء هيئة التدريس";
    default:
      return bucketId;
  }
}
