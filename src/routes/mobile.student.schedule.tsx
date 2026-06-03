import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Clock, User, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, dayLabel, TYPE_LABELS, type ScheduleRow } from "@/lib/schedule-export";

export const Route = createFileRoute("/mobile/student/schedule")({
  head: () => ({
    meta: [
      { title: "جدولي — تطبيق الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MobileStudentSchedulePage,
});

type Term = {
  year: string | null;
  semester: string | null;
};

type ScheduleData = {
  rows: ScheduleRow[];
  term: Term;
};

async function fetchMobileSchedule(): Promise<ScheduleData> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { rows: [], term: { year: null, semester: null } };

  const { data: sp } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!sp?.id) return { rows: [], term: { year: null, semester: null } };

  const [{ data: cy }, { data: cs }] = await Promise.all([
    supabase.from("academic_years").select("name").eq("is_current", true).maybeSingle(),
    supabase.from("semesters").select("name").eq("is_current", true).maybeSingle(),
  ]);

  const { data, error } = await supabase
    .from("student_enrollments")
    .select(
      "id, enrollment_status, section:course_sections(id, section_code, offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(id, schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code), faculty:faculty_profiles(full_name_ar)))",
    )
    .eq("student_profile_id", (sp as { id: string }).id)
    .eq("enrollment_status", "enrolled");

  if (error) throw error;

  type Raw = {
    id: string;
    section: {
      section_code: string;
      offering: { course: { code: string; name_ar: string } | null } | null;
      schedule: Array<{
        id: string;
        schedule_type: string;
        status: string;
        time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
        room: { name_ar: string; code: string } | null;
        faculty: { full_name_ar: string } | null;
      }> | null;
    } | null;
  };

  const rows: ScheduleRow[] = [];
  for (const e of (data ?? []) as unknown as Raw[]) {
    const sec = e.section;
    if (!sec) continue;
    for (const s of sec.schedule ?? []) {
      if (s.status !== "published" || !s.time_slot) continue;
      rows.push({
        id: s.id,
        course_code: sec.offering?.course?.code ?? "—",
        course_name: sec.offering?.course?.name_ar ?? "—",
        section_code: sec.section_code,
        faculty: s.faculty?.full_name_ar ?? null,
        room: s.room?.name_ar ?? s.room?.code ?? null,
        schedule_type: s.schedule_type,
        day_of_week: s.time_slot.day_of_week,
        start_time: s.time_slot.start_time,
        end_time: s.time_slot.end_time,
      });
    }
  }

  return {
    rows,
    term: {
      year: (cy as { name: string } | null)?.name ?? null,
      semester: (cs as { name: string } | null)?.name ?? null,
    },
  };
}

function formatTime(t: string): string {
  // Accepts "HH:MM:SS" or "HH:MM"
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function MobileStudentSchedulePage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "schedule"],
    queryFn: fetchMobileSchedule,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <CalendarClock className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-extrabold text-primary leading-tight">
              جدولي الدراسي
            </h1>
            {(data?.term.year || data?.term.semester) && (
              <p className="text-[10px] text-muted-foreground truncate">
                {[data.term.year, data.term.semester].filter(Boolean).join(" — ")}
              </p>
            )}
          </div>
        </div>
        <Link
          to="/mobile/student"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
      </header>

      {/* Loading skeleton */}
      {isLoading && <ScheduleSkeleton />}

      {/* Error */}
      {isError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3"
        >
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-extrabold">تعذّر تحميل الجدول</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
          >
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && (data?.rows.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm font-bold text-muted-foreground">
            لا يوجد جدول دراسي منشور حالياً.
          </p>
        </div>
      )}

      {/* Days */}
      {!isLoading && !isError && (data?.rows.length ?? 0) > 0 && (
        <div className="space-y-5">
          {DAYS.map((day) => {
            const dayRows = (data?.rows ?? [])
              .filter((r) => r.day_of_week === day.code)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            if (dayRows.length === 0) return null;
            return (
              <section key={day.code} aria-label={day.label}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h2 className="font-display text-sm font-extrabold text-primary">
                    {day.label}
                  </h2>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {dayRows.length} {dayRows.length === 1 ? "محاضرة" : "محاضرات"}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {dayRows.map((row) => (
                    <li key={row.id}>
                      <ScheduleCard row={row} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({ row }: { row: ScheduleRow }) {
  const typeLabel = TYPE_LABELS[row.schedule_type] ?? row.schedule_type;
  return (
    <article className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[13px] font-extrabold text-primary leading-tight">
            {row.course_name}
          </h3>
          <div
            dir="ltr"
            className="mt-0.5 text-[10px] font-mono text-muted-foreground text-right"
          >
            {row.course_code} • {row.section_code}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold text-primary-deep">
          {typeLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-foreground/80">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gold shrink-0" />
          <span dir="ltr" className="font-mono">
            {formatTime(row.start_time)} – {formatTime(row.end_time)}
          </span>
          <span className="text-muted-foreground">• {dayLabel(row.day_of_week)}</span>
        </div>
        {row.room && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="truncate">{row.room}</span>
          </div>
        )}
        {row.faculty && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="truncate">{row.faculty}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="space-y-2">
            {[0, 1].map((j) => (
              <div
                key={j}
                className="rounded-xl border border-border bg-card p-3.5 shadow-card space-y-3"
              >
                <div className="flex justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="h-2.5 w-1/3 rounded bg-muted/70 animate-pulse" />
                  </div>
                  <div className="h-5 w-12 rounded bg-muted animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2.5 w-1/2 rounded bg-muted/70 animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
