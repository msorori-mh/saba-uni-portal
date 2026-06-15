import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Loader2, ArrowRight, Printer, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportScheduleXlsx, logScheduleAudit, todayLabel, type ScheduleRow } from "@/lib/schedule-export";
import { PRINT_CSS, PrintHeader, WeeklyGrid, DayList, useSiteIdentity } from "@/components/schedule/ScheduleView";

export const Route = createFileRoute("/faculty-portal/schedule")({
  head: () => ({
    meta: [
      { title: "جدول التدريس — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultySchedulePage,
});

type FacultyInfo = {
  full_name_ar: string;
  employee_number: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
};

async function fetchData(): Promise<{ rows: ScheduleRow[]; info: FacultyInfo | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { rows: [], info: null };
  const { data: fp } = await supabase
    .from("faculty_profiles")
    .select("id, full_name_ar, employee_number, department:departments(name_ar)")
    .eq("user_id", auth.user.id).maybeSingle();
  if (!fp?.id) return { rows: [], info: null };

  const [{ data: cy }, { data: cs }] = await Promise.all([
    supabase.from("academic_years").select("name").eq("is_current", true).maybeSingle(),
    supabase.from("semesters").select("name").eq("is_current", true).maybeSingle(),
  ]);

  const info: FacultyInfo = {
    full_name_ar: (fp as any).full_name_ar,
    employee_number: (fp as any).employee_number ?? null,
    department: (fp as any).department?.name_ar ?? null,
    year: cy?.name ?? null,
    semester: cs?.name ?? null,
  };

  const { data, error } = await supabase
    .from("class_schedule")
    .select("id, schedule_type, status, time_slot:time_slots(day_of_week, start_time, end_time), room:rooms(name_ar, code), section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
    .eq("faculty_profile_id", (fp as any).id)
    .in("status", ["draft", "published"]);
  if (error) throw error;

  type Raw = { id: string; schedule_type: string; status: string;
    time_slot: { day_of_week: string; start_time: string; end_time: string } | null;
    room: { name_ar: string; code: string } | null;
    section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null; };
  const rows: ScheduleRow[] = ((data ?? []) as unknown as Raw[])
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
  return { rows, info };
}

function FacultySchedulePage() {
  const { data, isLoading } = useQuery({ queryKey: ["faculty-schedule-v2"], queryFn: fetchData, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false });
  const rows = data?.rows ?? [];
  const info = data?.info;
  const identity = useSiteIdentity();

  useEffect(() => {
    if (!isLoading) logScheduleAudit("timetable_viewed", "faculty");
  }, [isLoading]);

  const handlePrint = () => {
    logScheduleAudit("timetable_printed", "faculty");
    window.print();
  };
  const handleExport = () => {
    if (!rows.length || !info) return;
    const yearFile = (info.year ?? "current").replace(/[^\dA-Za-z]+/g, "_");
    const semFile = (info.semester ?? "").replace(/[^\dA-Za-z\u0600-\u06FF]+/g, "_");
    exportScheduleXlsx({
      filename: `faculty_schedule_${yearFile}_${semFile || "term"}.xlsx`,
      sheetName: "جدول التدريس",
      header: [
        [identity.university, identity.college],
        ["اسم عضو هيئة التدريس", info.full_name_ar],
        ["الرقم الوظيفي", info.employee_number ?? "—"],
        ["القسم", info.department ?? "—"],
        ["السنة الأكاديمية", info.year ?? "—"],
        ["الفصل", info.semester ?? "—"],
        ["تاريخ الإصدار", todayLabel()],
      ],
      rows,
      includeFaculty: false,
    });
    logScheduleAudit("timetable_exported", "faculty");
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
            <h1 className="font-display text-xl font-extrabold text-primary">جدول التدريس الأسبوعي</h1>
            <p className="text-xs text-muted-foreground">المحاضرات المسندة إليك هذا الفصل.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!rows.length}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
            <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
          <Link to="/faculty-portal" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
            <ArrowRight className="h-4 w-4" /> الرجوع
          </Link>
        </div>
      </div>

      {info && (
        <PrintHeader
          title="جدول التدريس الأسبوعي"
          lines={[
            ["الاسم", info.full_name_ar],
            ["الرقم الوظيفي", info.employee_number ?? "—"],
            ["القسم", info.department ?? "—"],
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
          لا توجد محاضرات مسندة حالياً.
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
