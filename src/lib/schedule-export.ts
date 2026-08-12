import { loadXLSX } from "@/lib/xlsx-loader";

export const DAYS: Array<{ code: string; label: string }> = [
  { code: "saturday", label: "السبت" },
  { code: "sunday", label: "الأحد" },
  { code: "monday", label: "الإثنين" },
  { code: "tuesday", label: "الثلاثاء" },
  { code: "wednesday", label: "الأربعاء" },
  { code: "thursday", label: "الخميس" },
  { code: "friday", label: "الجمعة" },
];

export const dayLabel = (c: string) => DAYS.find((d) => d.code === c)?.label ?? c;

export const TYPE_LABELS: Record<string, string> = {
  lecture: "محاضرة", lab: "عملي", tutorial: "تمارين", exam: "امتحان",
};

export type ScheduleRow = {
  id?: string;
  course_code: string;
  course_name: string;
  section_code: string;
  faculty?: string | null;
  room?: string | null;
  schedule_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
};

/** Build & download an xlsx for a schedule list. */
export async function exportScheduleXlsx(opts: {
  filename: string;
  sheetName?: string;
  header: Array<[string, string]>; // [label, value]
  rows: ScheduleRow[];
  includeFaculty?: boolean;
}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const aoa: any[][] = [];
  for (const [k, v] of opts.header) aoa.push([k, v]);
  aoa.push([]);
  const cols = ["اليوم", "من", "إلى", "رمز المقرر", "اسم المقرر", "المجموعات الدراسيةة", "القاعة", "النوع"];
  if (opts.includeFaculty) cols.push("عضو هيئة التدريس");
  aoa.push(cols);
  const sorted = [...opts.rows].sort((a, b) => {
    const di = DAYS.findIndex((d) => d.code === a.day_of_week) - DAYS.findIndex((d) => d.code === b.day_of_week);
    return di !== 0 ? di : a.start_time.localeCompare(b.start_time);
  });
  for (const r of sorted) {
    const row: any[] = [
      dayLabel(r.day_of_week),
      r.start_time.slice(0, 5),
      r.end_time.slice(0, 5),
      r.course_code,
      r.course_name,
      r.section_code,
      r.room ?? "—",
      TYPE_LABELS[r.schedule_type] ?? r.schedule_type,
    ];
    if (opts.includeFaculty) row.push(r.faculty ?? "—");
    aoa.push(row);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? "Schedule");
  XLSX.writeFile(wb, opts.filename);
}

/** Fire-and-forget audit log routed through the server (log_audit is not client-executable). */
export async function logScheduleAudit(
  action: "timetable_printed" | "timetable_exported" | "timetable_viewed",
  view_type: string,
  filters: Record<string, unknown> = {},
) {
  try {
    const { logScheduleEvent } = await import("@/lib/schedule-audit.functions");
    await logScheduleEvent({ data: { action, viewType: view_type, filters } });
  } catch { /* ignore */ }
}

export function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
}
