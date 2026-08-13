import { createFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import {
  Award,
  Bell,
  BookMarked,
  BookOpen,
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  Loader2,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  STUDENT_STATUS_LABELS_AR,
  useMobileStudentContext,
} from "@/lib/mobile/student-context";
import {
  buildMobileStudentServices,
  type MobileServiceKey,
} from "@/lib/mobile/student-services";

export const Route = createFileRoute("/mobile/student/")({
  component: MobileStudentHome,
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

/** Bottom-nav shortcuts repeated on the dashboard grid for one-tap access. */
const PRIMARY_CARDS: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "الجدول الدراسي", icon: CalendarClock, to: "/mobile/student/schedule" },
  { label: "الطلبات", icon: ClipboardList, to: "/mobile/student/requests" },
  { label: "الوثائق الرسمية", icon: FileText, to: "/mobile/student/documents" },
];

function MobileStudentHome() {
  usePagePerf("/mobile/student");
  const { data, isLoading } = useMobileStudentContext();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const profile = data?.profile ?? null;
  const services = buildMobileStudentServices({
    gpEligible: data?.gpEligible === true,
    isGraduate: data?.isGraduate === true,
  });

  const cards = [
    ...PRIMARY_CARDS,
    ...services.map((s) => ({ label: s.label, icon: ICONS[s.key], to: s.to })),
  ];

  return (
    <div className="px-4 py-5 space-y-5">
      <section className="rounded-2xl bg-gold-gradient text-primary-deep p-4 shadow-elegant">
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          مرحباً بعودتك
        </div>
        <div className="mt-1 font-display text-lg font-extrabold leading-tight truncate">
          {profile?.full_name_ar ?? "الطالب"}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] font-bold opacity-80">
          {profile?.academic_number && (
            <span dir="ltr" className="font-mono">
              {profile.academic_number}
            </span>
          )}
          {profile?.status && (
            <span className="rounded bg-primary-deep/10 px-1.5 py-0.5">
              {STUDENT_STATUS_LABELS_AR[profile.status] ?? profile.status}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-3">الخدمات</h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.to} to={card.to} className="block">
                <div className="relative h-full rounded-2xl border border-gold/40 bg-card p-3.5 shadow-card transition-all hover:border-gold active:scale-[0.98]">
                  <div className="grid h-10 w-10 place-items-center rounded-lg shrink-0 bg-gold-gradient text-primary-deep">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-[13px] font-extrabold text-primary leading-tight">
                    {card.label}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
