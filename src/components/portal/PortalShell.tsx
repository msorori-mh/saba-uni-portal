import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import universityLogo from "@/assets/university-logo.jpeg";
import { cn } from "@/lib/utils";
import { PageBackButton } from "@/components/navigation/PageBackButton";

export interface PortalShellProps {
  title?: string;
  /** @deprecated Use `title` */
  portalTitle?: string;
  subtitle?: string;
  onLogout: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** @deprecated Use `actions` */
  notifications?: ReactNode;
  className?: string;
  /** Extra classes for the header bar (e.g. "print:hidden" for print views). */
  headerClassName?: string;
}

export function PortalShell({
  title,
  portalTitle,
  subtitle = "كلية تكنولوجيا المعلومات وعلوم الحاسوب",
  onLogout,
  children,
  actions,
  notifications,
  className,
  headerClassName,
}: PortalShellProps) {
  const shellTitle = title ?? portalTitle ?? "البوابة الإلكترونية";
  const shellActions = actions ?? notifications;
  return (
    <div dir="rtl" className={cn("min-h-screen bg-background", className)}>
      <header
        className={cn(
          "border-b-2 border-gold/40 bg-primary-deep text-primary-foreground",
          headerClassName,
        )}
      >
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={universityLogo}
              alt="شعار جامعة إقليم سبأ"
              className="h-12 w-12 shrink-0 rounded-lg bg-white p-1 object-contain ring-2 ring-gold/50"
            />
            <div className="min-w-0">
              <div className="font-display font-extrabold leading-tight text-gold">
                {shellTitle}
              </div>
              <div className="truncate text-xs text-primary-foreground/70">{subtitle}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PageBackButton className="border-gold/40 text-gold hover:bg-gold hover:text-primary-deep" />
            {shellActions}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-md border border-gold/40 px-4 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
