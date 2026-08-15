import { Link } from "@tanstack/react-router";
import { ArrowRight, Home } from "lucide-react";

type StudentRequestsNavProps = {
  /** Optional crumb after بوابة الطالب */
  currentLabel?: string;
};

/**
 * Shared navigation for student requests tree — always offers a hard link to /student.
 * «رجوع» prefers history when available, with /student as fallback.
 */
export function StudentRequestsNav({
  currentLabel = "الخدمات الطلابية",
}: StudentRequestsNavProps) {
  return (
    <nav dir="rtl" aria-label="تنقل الخدمات الطلابية" className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/student"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary/50"
        >
          <Home className="h-3.5 w-3.5" />
          العودة إلى بوابة الطالب
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary/40 hover:text-primary"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
              return;
            }
            window.location.assign("/student");
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          رجوع
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        <Link to="/student" className="font-semibold text-primary hover:underline">
          بوابة الطالب
        </Link>
        <span className="mx-1.5 opacity-50">/</span>
        <span className="font-semibold text-foreground/80">{currentLabel}</span>
      </p>
    </nav>
  );
}
