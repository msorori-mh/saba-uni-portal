import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/student/schedule")({
  head: () => ({
    meta: [
      { title: "جدولي الدراسي — بوابة الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentSchedulePage,
});

const DAYS: Array<{ code: string; label: string }> = [
  { code: "saturday", label: "السبت" },
  { code: "sunday", label: "الأحد" },
  { code: "monday", label: "الإثنين" },
  { code: "tuesday", label: "الثلاثاء" },
  { code: "wednesday", label: "الأربعاء" },
  { code: "thursday", label: "الخميس" },
  { code: "friday", label: "الجمعة" },
];

const TYPE_LABELS: Record<string, string> = {
  lecture: "محاضرة", lab: "عملي", tutorial: "تمارين", exam: "امتحان",
};

type Row = {
  id: string;
  course_code: string;
  course_name: string;
  section_code: string;
  faculty: string | null;
  room: string | null;
  schedule_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
};

async function fetchSchedule(): Promise<Row[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: sp } = await supabase
    .from("student_profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
  if (!sp?.id) return [];

  const { data, error } = await supabase
    .from("student_enrollments")
    .select("id, enrollment_status, section:course_sections(id, section_code, offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(id, schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code), faculty:faculty_profiles(full_name_ar)))")
    .eq("student_profile_id", sp.id)
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
  const rows: Row[] = [];
  for (const e of (data ?? []) as unknown as Raw[]) {
    const sec = e.section; if (!sec) continue;
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
  return rows;
}

function StudentSchedulePage() {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["student-schedule"], queryFn: fetchSchedule });

  const grouped = new Map<string, Row[]>();
  for (const d of DAYS) grouped.set(d.code, []);
  for (const r of rows) grouped.get(r.day_of_week)?.push(r);
  for (const k of grouped.keys()) {
    grouped.get(k)!.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return (
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">جدولي الدراسي الأسبوعي</h1>
            <p className="text-xs text-muted-foreground">المحاضرات المعتمدة للمقررات المسجّلة هذا الفصل.</p>
          </div>
        </div>
        <Link to="/student" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
          <ArrowRight className="h-4 w-4" /> الرجوع للبوابة
        </Link>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد محاضرات مجدولة بعد لمقرراتك.
        </div>
      ) : (
        <div className="space-y-3">
          {DAYS.map((d) => {
            const items = grouped.get(d.code) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={d.code} className="rounded-lg border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{d.label}</div>
                <div className="divide-y">
                  {items.map((r) => (
                    <div key={r.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                      <div className="font-mono text-xs bg-muted px-2 py-1 rounded shrink-0">
                        {r.start_time.slice(0, 5)} - {r.end_time.slice(0, 5)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">
                          <span className="font-mono">{r.course_code}</span> — {r.course_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          شعبة {r.section_code}
                          {r.faculty && <> • {r.faculty}</>}
                          {r.room && <> • {r.room}</>}
                        </div>
                      </div>
                      <span className="text-[10px] bg-card border px-2 py-0.5 rounded font-bold">
                        {TYPE_LABELS[r.schedule_type] ?? r.schedule_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
