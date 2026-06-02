import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/faculty-portal/schedule")({
  head: () => ({
    meta: [
      { title: "جدول التدريس — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultySchedulePage,
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
  room: string | null;
  schedule_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
};

async function fetchFacultySchedule(): Promise<Row[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: fp } = await supabase
    .from("faculty_profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
  if (!fp?.id) return [];

  const { data, error } = await supabase
    .from("class_schedule")
    .select("id, schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code), section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
    .or(`faculty_profile_id.eq.${fp.id}`)
    .in("status", ["draft", "published"]);
  if (error) throw error;

  type Raw = {
    id: string;
    schedule_type: string;
    status: string;
    time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
    room: { name_ar: string; code: string } | null;
    section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((r) => r.time_slot)
    .map((r) => ({
      id: r.id,
      course_code: r.section?.offering?.course?.code ?? "—",
      course_name: r.section?.offering?.course?.name_ar ?? "—",
      section_code: r.section?.section_code ?? "—",
      room: r.room?.name_ar ?? r.room?.code ?? null,
      schedule_type: r.schedule_type,
      day_of_week: r.time_slot!.day_of_week,
      start_time: r.time_slot!.start_time,
      end_time: r.time_slot!.end_time,
    }));
}

function FacultySchedulePage() {
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["faculty-schedule"], queryFn: fetchFacultySchedule });

  const grouped = new Map<string, Row[]>();
  for (const d of DAYS) grouped.set(d.code, []);
  for (const r of rows) grouped.get(r.day_of_week)?.push(r);
  for (const k of grouped.keys()) grouped.get(k)!.sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">جدول التدريس الأسبوعي</h1>
            <p className="text-xs text-muted-foreground">المحاضرات المسندة إليك هذا الفصل.</p>
          </div>
        </div>
        <Link to="/faculty-portal" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
          <ArrowRight className="h-4 w-4" /> الرجوع للبوابة
        </Link>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد محاضرات مسندة إليك بعد.
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
                        <div className="font-bold"><span className="font-mono">{r.course_code}</span> — {r.course_name}</div>
                        <div className="text-xs text-muted-foreground">شعبة {r.section_code}{r.room && <> • {r.room}</>}</div>
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
