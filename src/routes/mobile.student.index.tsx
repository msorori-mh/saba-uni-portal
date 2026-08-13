import { createFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardList,
  FileText,
  Award,
  BookOpen,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { portalFeatures } from "@/lib/portal-features";
import {
  resolveCanonicalCurrentFourthLevelEligibility,
  shouldShowStudentGpNav,
  type AcademicStatusTimestampRow,
} from "@/lib/graduation-projects/eligibility";

export const Route = createFileRoute("/mobile/student/")({
  component: MobileStudentHome,
});

type ProfileSummary = {
  id: string;
  full_name_ar: string | null;
  academic_number: string | null;
  status: string | null;
};

type HomeData = {
  profile: ProfileSummary | null;
  academicStatus: AcademicStatusTimestampRow[];
};

async function fetchSummary(): Promise<HomeData> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { profile: null, academicStatus: [] };
  const { data } = await supabase
    .from("student_profiles")
    .select("id, full_name_ar, academic_number, status")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const profile = (data as ProfileSummary) ?? null;
  if (!profile) return { profile: null, academicStatus: [] };

  const { data: acad } = await supabase
    .from("student_academic_status")
    .select("id, level_id, created_at, updated_at, level:academic_levels(level_number)")
    .eq("student_profile_id", profile.id);

  return {
    profile,
    academicStatus: (acad ?? []) as unknown as AcademicStatusTimestampRow[],
  };
}

type DashboardCard = {
  label: string;
  icon: LucideIcon;
  to: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف قيد",
  graduated: "خريج",
  withdrawn: "منسحب",
};

/**
 * Only services that are actually live are shown — no "coming soon" tiles.
 * Every target stays inside the `/mobile/student` container.
 */
function buildCards(args: { gpEligible: boolean; isGraduate: boolean }): DashboardCard[] {
  const cards: DashboardCard[] = [
    { label: "الجدول الدراسي", icon: CalendarClock, to: "/mobile/student/schedule" },
    { label: "الطلبات", icon: ClipboardList, to: "/mobile/student/requests" },
    { label: "الوثائق الرسمية", icon: FileText, to: "/mobile/student/documents" },
    { label: "الدرجات", icon: Award, to: "/mobile/student/grades" },
  ];
  if (portalFeatures.studentUnofficialTranscript) {
    cards.push({ label: "السجل الأكاديمي", icon: BookOpen, to: "/mobile/student/academic-record" });
  }
  // مشروع التخرج وشؤون الخريجين غير منشورين في تطبيق الجوال بعد؛ لا تُعرض
  // بطاقات وهمية. البوابة على المتصفح تبقى المصدر لهاتين الخدمتين.
  void args;
  return cards;
}

function MobileStudentHome() {
  usePagePerf("/mobile/student");
  const { data, isLoading } = useQuery({
    queryKey: ["mobile-student", "summary"],
    queryFn: fetchSummary,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const profile = data?.profile ?? null;
  // Presentation only — the backend L4 predicate remains authoritative.
  const gpEligible = shouldShowStudentGpNav(
    resolveCanonicalCurrentFourthLevelEligibility(data?.academicStatus ?? []).eligible,
  );
  const cards = buildCards({
    gpEligible,
    isGraduate: profile?.status === "graduated",
  });

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Welcome card */}
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
              {STATUS_LABEL[profile.status] ?? profile.status}
            </span>
          )}
        </div>
      </section>

      {/* Dashboard grid */}
      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-3">
          الخدمات
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} to={card.to} className="block">
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
