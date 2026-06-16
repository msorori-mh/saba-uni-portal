import { forwardRef, type InputHTMLAttributes } from "react";
import { User, X } from "lucide-react";

interface IdentifierInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  showClear?: boolean;
}

export const IdentifierInput = forwardRef<HTMLInputElement, IdentifierInputProps>(
  ({ className, onClear, showClear = true, value, ...props }, ref) => {
    const hasValue = typeof value === "string" && value.length > 0;
    return (
      <div className="relative">
        <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          value={value}
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className={
            className ??
            "w-full rounded-md border border-input bg-background pr-10 pl-10 py-3 text-sm text-right outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          }
          {...props}
        />
        {showClear && hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="مسح الحقل"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
IdentifierInput.displayName = "IdentifierInput";

export function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // Supabase AuthApiError v2 carries a structured code on the error object
  const code = (err as any)?.code ?? (err as any)?.error_code ?? "";
  const status = (err as any)?.status;
  const m = raw.toLowerCase();
  const c = String(code).toLowerCase();

  if (c === "user_banned" || m.includes("user is banned") || m.includes("banned"))
    return "هذا الحساب معطّل من قبل إدارة النظام. الرجاء التواصل مع الدعم لإعادة تفعيله.";
  if (c === "user_not_found" || m.includes("user not found"))
    return "لا يوجد حساب مرتبط بهذا الرقم. تحقق من البيانات أو تواصل مع الدعم.";
  if (c === "email_not_confirmed" || m.includes("email not confirmed"))
    return "لم يتم تفعيل الحساب بعد. تواصل مع الدعم الفني.";
  if (c === "invalid_credentials" || m.includes("invalid login credentials") || m.includes("invalid") || m.includes("credentials") || m === "invalid")
    return "الرقم أو كلمة المرور غير صحيحة.";
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch"))
    return "تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.";
  if (c === "over_request_rate_limit" || status === 429 || m.includes("rate") || m.includes("too many"))
    return "محاولات كثيرة جدًا. الرجاء المحاولة بعد قليل.";
  if (m === "mismatch") return "هذا الحساب لا يطابق نوع الدخول المختار";
  if (m === "forbidden") return "هذا الحساب لا يملك صلاحية الدخول إلى لوحة الإدارة";
  if (!raw) return "تعذّر إكمال الطلب. الرجاء المحاولة مرة أخرى.";
  return `تعذّر تسجيل الدخول: ${raw}`;
}
