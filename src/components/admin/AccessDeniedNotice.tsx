import { ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Detects authorization failures coming back from server functions. */
export function isAuthorizationError(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? "";
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  return /ليس لديك صلاحية|غير مصرح|Unauthorized|Forbidden|403|401/i.test(message);
}

export function AccessDeniedNotice({
  error,
  title = "لا تملك صلاحية الوصول إلى هذه الصفحة",
  onRetry,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const message = (error as { message?: string } | null)?.message;
  return (
    <div className="p-6" dir="rtl">
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold text-destructive">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {message ?? "هذه الصفحة متاحة لمديري النظام فقط. تواصل مع مدير النظام لمنحك الصلاحية المناسبة."}
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button asChild variant="outline">
            <Link to="/admin">العودة إلى لوحة الإدارة</Link>
          </Button>
          {onRetry && (
            <Button variant="ghost" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 ml-1" /> إعادة المحاولة
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Generic (non-authorization) failure state with a retry affordance. */
export function LoadErrorNotice({
  error,
  title = "تعذّر تحميل البيانات",
  onRetry,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  if (isAuthorizationError(error)) return <AccessDeniedNotice error={error} onRetry={onRetry} />;
  const message = (error as { message?: string } | null)?.message;
  return (
    <div className="p-6" dir="rtl">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center space-y-3">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {message && <p className="text-sm text-muted-foreground break-words">{message}</p>}
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 ml-1" /> إعادة المحاولة
          </Button>
        )}
      </div>
    </div>
  );
}
