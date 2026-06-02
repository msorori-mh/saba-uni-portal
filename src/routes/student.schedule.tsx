import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Loader2, ArrowRight, Printer, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportScheduleXlsx, logScheduleAudit, todayLabel, type ScheduleRow } from "@/lib/schedule-export";
import { PRINT_CSS, PrintHeader, WeeklyGrid, DayList, useSiteIdentity } from "@/components/schedule/ScheduleView";

export const Route = createFileRoute("/student/schedule")({
  head: () => ({
    meta: [
      { title: "جدولي الدراسي — بوابة الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentSchedulePage,
});

type StudentInfo = {
  full_name_ar: string;
  academic_number: string;
  program?: string | null;
  level?: string | null;
  year?: string | null;
  semester?: string | null;
};

async function fetchData(): Promise<{ rows: ScheduleRow[]; info: StudentInfo | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { rows: [], info: null };
  const { data: sp } = await supabase
    .from("student_profiles")
    .select("id, full_name_ar, academic_number, program:programs(name_ar)")
    .eq("user_id", auth.user.id).maybeSingle();
  if (!sp?.id) return { rows: [], info: null };

  const [{ data: cy }, { data: cs }] = await Promise.all([
    supabase.from("academic_years").select("id, name").eq("is_current", true).maybeSingle(),
    supabase.from("semesters").select("id, name").eq("is_current", true).maybeSingle(),
  ]);

  let levelName: string | null = null;
  if (cy?.id && cs?.id) {
    const { data: sas } = await supabase
      .from("student_academic_status")
      .select("level:academic_levels(name)")
      .eq("student_profile_id", (sp as any).id)
      .eq("academic_year_id", cy.id)
      .eq("semester_id", cs.id)
      .maybeSingle();
    levelName = (sas as any)?.level?.name ?? null;
  }

  const info: StudentInfo = {
    full_name_ar: (sp as any).full_name_ar,
    academic_number: (sp as any).academic_number,
    program: (sp as any).program?.name_ar ?? null,
    level: levelName,
    year: cy?.name ?? null,
    semester: cs?.name ?? null,
  };

  const { data, error } = await supabase
    .from("student_enrollments")
    .select("id, enrollment_status, section:course_sections(id, section_code, offering:course_offerings(course:courses(code, name_ar)), schedule:class_schedule(id, schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code), faculty:faculty_profiles(full_name_ar)))")
    .eq("student_profile_id", (sp as any).id)
    .eq("enrollment_status", "enrolled");
  if (error) throw error;

  type Raw = { id: string; section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null;
      schedule: Array<{ id: string; schedule_type: string; status: string;
        time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
        room: { name_ar: string; code: string } | null;
        faculty: { full_name_ar: string } | null; }> | null; } | null; };
  const rows: ScheduleRow[] = [];
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
  return { rows, info };
}

function StudentSchedulePage() {
  const { data, isLoading } = useQuery({ queryKey: ["student-schedule-v2"], queryFn: fetchData });
  const rows = data?.rows ?? [];
  const info = data?.info;
  const identity = useSiteIdentity();

  useEffect(() => {
    if (!isLoading) logScheduleAudit("timetable_viewed", "student");
  }, [isLoading]);

  const handlePrint = () => {
    logScheduleAudit("timetable_printed", "student");
    window.print();
  };
  const handleExport = () => {
    if (!rows.length || !info) return;
    const yearFile = (info.year ?? "current").replace(/[^\dA-Za-z]+/g, "_");
    const semFile = (info.semester ?? "").replace(/[^\dA-Za-z\u0600-\u06FF]+/g, "_");
    exportScheduleXlsx({
      filename: `student_schedule_${yearFile}_${semFile || "term"}.xlsx`,
      sheetName: "جدولي",
      header: [
        [identity.university, identity.college],
        ["اسم الطالب", info.full_name_ar],
        ["الرقم الأكاديمي", info.academic_number],
        ["البرنامج", info.program ?? "—"],
        ["المستوى", info.level ?? "غير محدد"],
        ["السنة الأكاديمية", info.year ?? "—"],
        ["الفصل", info.semester ?? "—"],
        ["تاريخ الإصدار", todayLabel()],
      ],
      rows,
      includeFaculty: true,
    });
    logScheduleAudit("timetable_exported", "student");
  };

  return (
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-5xl space-y-5 print-page">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">جدولي الدراسي الأسبوعي</h1>
            <p className="text-xs text-muted-foreground">المحاضرات المعتمدة للمقررات المسجّلة هذا الفصل.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!rows.length}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
            <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
          <Link to="/student" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
            <ArrowRight className="h-4 w-4" /> الرجوع
          </Link>
        </div>
      </div>

      {info && (
        <PrintHeader
          title="الجدول الدراسي الأسبوعي للطالب"
          lines={[
            ["اسم الطالب", info.full_name_ar],
            ["الرقم الأكاديمي", info.academic_number],
            ["البرنامج", info.program ?? "—"],
            ["المستوى", info.level ?? "غير محدد"],
            ["السنة الأكاديمية", info.year ?? "—"],
            ["الفصل", info.semester ?? "—"],
            ["تاريخ الإصدار", todayLabel()],
          ]}
        />
      )}


      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا يوجد جدول دراسي منشور حالياً.
        </div>
      ) : (
        <>
          <div className="hidden md:block"><WeeklyGrid rows={rows} /></div>
          <div className="md:hidden"><DayList rows={rows} /></div>
        </>
      )}
    </div>
  );
}
