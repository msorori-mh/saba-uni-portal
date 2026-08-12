import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, BookOpen, CalendarClock, ClipboardList, FileText, type LucideIcon } from "lucide-react";
import { portalFeatures } from "@/lib/portal-features";
import { ANDROID_APP_DISPLAY_NAME } from "@/lib/native/platform";

export const Route = createFileRoute("/mobile/student/more")({
  head: () => ({ meta: [{ title: "المزيد" }] }),
  component: MobileStudentMore,
});

type MoreItem = { label: string; to: string; icon: LucideIcon };

function buildItems(): MoreItem[] {
  const items: MoreItem[] = [
    { label: "الجدول الدراسي", to: "/mobile/student/schedule", icon: CalendarClock },
    { label: "الطلبات", to: "/mobile/student/requests", icon: ClipboardList },
    { label: "الوثائق الرسمية", to: "/mobile/student/documents", icon: FileText },
    { label: "الدرجات", to: "/mobile/student/grades", icon: Award },
  ];
  if (portalFeatures.studentUnofficialTranscript) {
    items.push({ label: "السجل الأكاديمي", to: "/mobile/student/academic-record", icon: BookOpen });
  }
  return items;
}

function MobileStudentMore() {
  const items = buildItems();
  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary">المزيد</h1>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {items.map(({ label, to, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold text-primary">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        {ANDROID_APP_DISPLAY_NAME} — تطبيق الطالب. الخدمات المعروضة هنا هي الخدمات المفعّلة
        فعلياً لحسابك.
      </p>
    </div>
  );
}
