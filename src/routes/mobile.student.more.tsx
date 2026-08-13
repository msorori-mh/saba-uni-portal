import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Award,
  Bell,
  BookMarked,
  BookOpen,
  BarChart3,
  ChevronLeft,
  GraduationCap,
  Loader2,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ANDROID_APP_DISPLAY_NAME } from "@/lib/native/platform";
import { useMobileStudentContext } from "@/lib/mobile/student-context";
import {
  buildMobileMoreHub,
  type MobileServiceGroup,
  type MobileServiceKey,
} from "@/lib/mobile/student-services";

export const Route = createFileRoute("/mobile/student/more")({
  head: () => ({ meta: [{ title: "المزيد" }] }),
  component: MobileStudentMore,
});

const ICONS: Record<MobileServiceKey, LucideIcon> = {
  grades: Award,
  materials: BookOpen,
  "study-plan": BookMarked,
  reports: BarChart3,
  notifications: Bell,
  profile: UserRound,
  settings: Settings2,
  "graduation-projects": GraduationCap,
  "graduates-affairs": Users,
  "academic-record": BookOpen,
};

const GROUP_LABELS: Record<MobileServiceGroup, string> = {
  core: "خدماتي",
  academic: "الأكاديمية",
  communication: "التواصل",
  account: "الحساب",
  conditional: "خدمات خاصة",
};

const GROUP_ORDER: MobileServiceGroup[] = [
  "core",
  "academic",
  "conditional",
  "communication",
  "account",
];

/** Additional-services hub — never duplicates the bottom navigation. */
function MobileStudentMore() {
  const { data, isLoading } = useMobileStudentContext();
  const items = buildMobileMoreHub({
    gpEligible: data?.gpEligible === true,
    isGraduate: data?.isGraduate === true,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary">المزيد</h1>

      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <section key={group} className="space-y-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group]}
            </h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card overflow-hidden">
              {groupItems.map((item) => {
                const Icon = ICONS[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-bold text-primary">{item.label}</span>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        {ANDROID_APP_DISPLAY_NAME} — تطبيق الطالب. الخدمات المعروضة هنا هي الخدمات المفعّلة
        فعلياً لحسابك.
      </p>
    </div>
  );
}
