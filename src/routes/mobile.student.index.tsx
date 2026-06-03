import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Wallet,
  ClipboardList,
  FileText,
  Award,
  BookOpen,
  TrendingUp,
  Bell,
  User,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/student/")({
  component: MobileStudentHome,
});

type ProfileSummary = {
  full_name_ar: string | null;
  academic_number: string | null;
  status: string | null;
};

async function fetchSummary(): Promise<ProfileSummary | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("student_profiles")
    .select("full_name_ar, academic_number, status")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return (data as ProfileSummary) ?? null;
}

type DashboardCard = {
  label: string;
  icon: LucideIcon;
  enabled: boolean;
};

const CARDS: DashboardCard[] = [
  { label: "الجدول الدراسي", icon: CalendarClock, enabled: false },
  { label: "الرسوم والمدفوعات", icon: Wallet, enabled: false },
  { label: "الطلبات", icon: ClipboardList, enabled: false },
  { label: "الوثائق الرسمية", icon: FileText, enabled: false },
  { label: "الدرجات", icon: Award, enabled: false },
  { label: "السجل الأكاديمي", icon: BookOpen, enabled: false },
  { label: "التقدم الأكاديمي", icon: TrendingUp, enabled: false },
  { label: "الإشعارات", icon: Bell, enabled: false },
  { label: "الملف الشخصي", icon: User, enabled: false },
];

const STATUS_LABEL: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف قيد",
  graduated: "خريج",
  withdrawn: "منسحب",
};

function MobileStudentHome() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["mobile-student", "summary"],
    queryFn: fetchSummary,
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

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

      {/* Notice */}
      <div className="rounded-lg border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground text-center">
        تطبيق الطالب قيد التطوير — ستتوفر الخدمات تدريجياً.
      </div>

      {/* Dashboard grid */}
      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-3">
          الخدمات
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                aria-disabled={!card.enabled}
                className={[
                  "relative rounded-2xl border bg-card p-3.5 shadow-card transition-all",
                  card.enabled
                    ? "border-gold/40 hover:border-gold"
                    : "border-border opacity-70",
                ].join(" ")}
              >
                <div
                  className={[
                    "grid h-10 w-10 place-items-center rounded-lg shrink-0",
                    card.enabled
                      ? "bg-gold-gradient text-primary-deep"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-[13px] font-extrabold text-primary leading-tight">
                  {card.label}
                </div>
                {!card.enabled && (
                  <span className="absolute top-2 left-2 rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-extrabold text-primary-deep">
                    قريباً
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
