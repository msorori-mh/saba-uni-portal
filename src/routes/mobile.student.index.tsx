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
  buildMobileHomeServices,
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

function IdentityRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold text-primary-deep/60">{label}</div>
      <div
        dir={mono ? "ltr" : undefined}
        className={`truncate text-[12px] font-extrabold text-primary-deep ${mono ? "font-mono text-right" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

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
  const enrolment = data?.currentEnrolment ?? null;
  const services = buildMobileHomeServices({
    gpEligible: data?.gpEligible === true,
    isGraduate: data?.isGraduate === true,
  });

  const cards = [
    ...PRIMARY_CARDS,
    ...services.map((s) => ({ label: s.label, icon: ICONS[s.key], to: s.to })),
  ];

  const identity: { label: string; value: string; mono?: boolean }[] = [];
  if (profile?.academic_number)
    identity.push({ label: "الرقم الجامعي", value: profile.academic_number, mono: true });
  if (profile?.department?.name_ar)
    identity.push({ label: "القسم", value: profile.department.name_ar });
  if (profile?.program?.name_ar)
    identity.push({ label: "البرنامج", value: profile.program.name_ar });
  if (enrolment?.levelName || data?.levelNumber)
    identity.push({
      label: "المستوى",
      value: enrolment?.levelName ?? `المستوى ${data?.levelNumber}`,
    });
  if (enrolment?.semesterName)
    identity.push({ label: "الفصل الحالي", value: enrolment.semesterName });
  if (profile?.status)
    identity.push({
      label: "حالة القيد",
      value: STUDENT_STATUS_LABELS_AR[profile.status] ?? profile.status,
    });

  return (
    <div className="px-4 py-5 space-y-6">
      {/* Welcome + identity summary */}
      <section className="overflow-hidden rounded-2xl shadow-elegant">
        <div className="bg-gold-gradient text-primary-deep px-4 pt-4 pb-3.5">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            مرحباً بعودتك
          </div>
          <div className="mt-1 font-display text-lg font-extrabold leading-tight truncate">
            {profile?.full_name_ar ?? "الطالب"}
          </div>
        </div>
        {identity.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-primary-deep/10 bg-gold/25 px-4 py-3">
            {identity.map((row) => (
              <IdentityRow key={row.label} {...row} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-gold" />
          <h2 className="font-display text-sm font-extrabold text-primary">الخدمات الأساسية</h2>
        </div>
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
