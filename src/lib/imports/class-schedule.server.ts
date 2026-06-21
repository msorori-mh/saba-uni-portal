// PR-6B: Server-side schedule import — re-validates then calls atomic RPC via service_role.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadScheduleLookups,
  validateClassSchedule,
  type ScheduleContext,
  type ScheduleImportReport,
} from "./class-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabaseAdmin as any;

export async function executeScheduleImport(
  ctx: ScheduleContext,
  rawRows: Record<string, unknown>[],
): Promise<ScheduleImportReport> {
  const report: ScheduleImportReport = {
    rows_total: rawRows.length,
    rows_inserted: 0,
    rows_failed: 0,
    slots_created: 0,
    errors: [],
    aborted: false,
  };

  const lookups = await loadScheduleLookups(ctx, sb);
  const validation = await validateClassSchedule(rawRows, ctx, lookups, sb);

  report.rows_total = validation.totalRows;

  if (validation.invalidRows > 0) {
    report.aborted = true;
    report.abortReason = "الملف يحتوي صفوفاً غير صالحة. صحّح الأخطاء ثم أعد الرفع.";
    for (const r of validation.rows) r.errors.forEach((e) => report.errors.push(e));
    report.rows_failed = validation.invalidRows;
    return report;
  }

  if (validation.blockingConflicts.length > 0) {
    report.aborted = true;
    report.abortReason = "الملف يحتوي تعارضات حرجة. تم رفض الملف بالكامل.";
    validation.blockingConflicts.forEach((c) => report.errors.push(c));
    return report;
  }

  const rpcRows = validation.rows
    .filter((r) => r.parsed !== null)
    .map((r) => ({
      course_section_id: r.parsed!.course_section_id,
      room_id: r.parsed!.room_id,
      faculty_profile_id: r.parsed!.faculty_profile_id,
      day_of_week: r.parsed!.day_of_week,
      start_time: r.parsed!.start_time,
      end_time: r.parsed!.end_time,
      schedule_type: r.parsed!.schedule_type,
      status: r.parsed!.status,
    }));

  const { data, error } = await sb.rpc("replace_class_schedule_for_context", {
    _section_ids: lookups.contextSectionIds,
    _rows: rpcRows,
  });

  if (error) {
    report.aborted = true;
    report.abortReason = error.message;
    report.rows_failed = validation.validRows;
    return report;
  }

  const result = (data ?? {}) as {
    rows_inserted?: number;
    slots_created?: number;
  };

  report.rows_inserted = result.rows_inserted ?? rpcRows.length;
  report.slots_created = result.slots_created ?? 0;
  return report;
}
