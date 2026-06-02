import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  showCapsLockWarning?: boolean;
  wrapperClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showCapsLockWarning = true, className, wrapperClassName, onKeyDown, onKeyUp, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const [capsOn, setCapsOn] = useState(false);

    const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => {
      if (typeof e.getModifierState === "function") {
        setCapsOn(e.getModifierState("CapsLock"));
      }
    };

    return (
      <div className={wrapperClassName}>
        <div className="relative">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            className={
              className ??
              "w-full rounded-md border border-input bg-background pr-10 pl-11 py-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            }
            onKeyDown={(e) => { checkCaps(e); onKeyDown?.(e); }}
            onKeyUp={(e) => { checkCaps(e); onKeyUp?.(e); }}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            aria-pressed={visible}
            tabIndex={0}
            className="absolute left-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showCapsLockWarning && capsOn && (
          <p className="mt-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            تنبيه: مفتاح Caps Lock مفعّل
          </p>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
