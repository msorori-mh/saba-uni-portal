import { Globe } from "lucide-react";
import universityLogo from "@/assets/university-logo.jpeg";

const PORTAL_NAMES: Array<[string, string]> = [
  ["/faculty-portal", "بوابة عضو هيئة التدريس"],
  ["/student", "بوابة الطالب"],
  ["/staff", "بوابة الموظف"],
];

/**
 * Slim portal header for internal pages that do not render their own
 * PortalShell. Hidden by CSS whenever a PortalShell is on the page.
 */
export function PortalFallbackBar({ pathname }: { pathname: string }) {
  const name = PORTAL_NAMES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? "البوابة الإلكترونية";
  return (
    <header dir="rtl" className="portal-fallback-bar no-print border-b-2 border-gold/40 bg-primary-deep text-primary-foreground">
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src={universityLogo} alt="شعار جامعة إقليم سبأ" className="h-10 w-10 shrink-0 rounded-lg bg-white p-1 object-contain ring-2 ring-gold/50" />
          <div className="min-w-0">
            <div className="font-display font-extrabold leading-tight text-gold">{name}</div>
            <div className="truncate text-xs text-primary-foreground/70">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
          </div>
        </div>
        <a href="/" className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary-foreground/80 hover:text-gold">
          <Globe className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">الموقع الإلكتروني</span>
        </a>
      </div>
    </header>
  );
}
