import { AlertTriangle, Inbox, Loader2, Lock, WifiOff } from "lucide-react";
import { GRADUATION_PROJECTS_SERVICE_UPDATING_MSG } from "@/lib/graduation-projects/rpc";

export function GraduationProjectsLoading({ label = "جاري التحميل..." }: { label?: string }) {
  return (
    <div
      dir="rtl"
      data-testid="gp-loading"
      className="grid place-items-center gap-2 py-16 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}

export function GraduationProjectsUnavailable({
  message = GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
}: {
  message?: string;
}) {
  return (
    <div
      dir="rtl"
      data-testid="gp-unavailable"
      className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground"
      role="alert"
    >
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-600" />
      <p className="font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs">لا تُعرض أي بيانات تجريبية في هذه البيئة.</p>
    </div>
  );
}

export function GraduationProjectsEmpty({
  message = "لا توجد مشاريع تخرج مسندة إليك حالياً.",
}: {
  message?: string;
}) {
  return (
    <div
      dir="rtl"
      data-testid="gp-empty"
      className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground"
    >
      <Inbox className="mx-auto mb-2 h-6 w-6" />
      {message}
    </div>
  );
}

export function GraduationProjectsPermissionDenied({
  message = "ليست لديك صلاحية للوصول إلى هذا المشروع.",
}: {
  message?: string;
}) {
  return (
    <div
      dir="rtl"
      data-testid="gp-permission-denied"
      className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground"
      role="alert"
    >
      <Lock className="mx-auto mb-2 h-6 w-6" />
      {message}
    </div>
  );
}

export function GraduationProjectsNetworkError({
  message = "تعذّر الاتصال بالخدمة. تحقق من الشبكة ثم أعد المحاولة.",
}: {
  message?: string;
}) {
  return (
    <div
      dir="rtl"
      data-testid="gp-network-error"
      className="rounded-xl border border-destructive/40 bg-card p-6 text-center text-sm text-muted-foreground"
      role="alert"
    >
      <WifiOff className="mx-auto mb-2 h-6 w-6 text-destructive" />
      {message}
    </div>
  );
}

export function GraduationProjectsStatusBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      dir="rtl"
      data-testid="gp-status-banner"
      className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-primary"
    >
      {message}
    </div>
  );
}
