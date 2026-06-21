// SCHEDULES-IMPORT-HANDLER-IMPLEMENT-01
// Self-contained importer for class_schedule. Implements:
//   - Context-aware lookups (academic_year + semester + program + level).
//   - Strict validator (format + lookups + in-file conflicts + DB cross-context conflicts).
//   - Replace-Context import: deletes existing class_schedule rows for context sections, then inserts new ones.
//   - Auto-creates missing time_slots (unique by day+start+end with CHECK start<end).
//   - Reject-file-on-conflict policy: any critical conflict aborts the whole import (no partial writes).
//
// Notes:
// * Preview validation may run client-side (JWT) or server-side (supabaseAdmin).
// * Writes run server-side via replace_class_schedule_for_context RPC (PR-6B).
import { supabase } from "@/integrations/supabase/client";
import type { RowError } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScheduleDbClient = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultClient = (): ScheduleDbClient => supabase as ScheduleDbClient;
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const norm = (v: unknown) => str(v).toLowerCase();

const DAYS = new Set(["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]);
const TYPES = new Set(["lecture", "lab", "tutorial", "exam"]);
const STATUSES = new Set(["draft", "published", "cancelled"]);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export type ScheduleContext = {
  academic_year_id: string;
  semester_id: string;
  program_id: string;
  level_id: string;
};

export type ScheduleParsedRow = {
  course_section_id: string;
  room_id: string;
  faculty_profile_id: string | null;
  day_of_week: string;
  start_time: string; // HH:MM:SS
  end_time: string;
  schedule_type: string;
  status: string;
  // dedup keys
  _slotKey: string; // day|start|end
};

export type ScheduleValidatedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  errors: RowError[];
  parsed: ScheduleParsedRow | null;
};

export type ScheduleValidationResult = {
  rows: ScheduleValidatedRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  /** Cross-context (or in-file) critical conflicts. Non-empty ⇒ import must be rejected entirely. */
  blockingConflicts: RowError[];
};

export type ScheduleLookups = {
  /** course_code (lowercased) → offering id for the context */
  offeringByCourseCode: Map<string, string>;
  /** offering_id|section_code (lowercased) → section id */
  sectionByOfferingAndCode: Map<string, string>;
  /** All section ids belonging to the context (for Replace Context delete) */
  contextSectionIds: string[];
  /** room code (lowercased) → room id */
  roomByCode: Map<string, string>;
  /** employee_number (lowercased) → faculty_profile id */
  facultyByEmployeeNumber: Map<string, string>;
  /** day|start|end → time_slot id */
  timeSlotByKey: Map<string, string>;
};

export async function loadScheduleLookups(
  ctx: ScheduleContext,
  client?: ScheduleDbClient,
): Promise<ScheduleLookups> {
  const sb = client ?? defaultClient();
  // Offerings for the exact context
  const { data: offRows } = await sb
    .from("course_offerings")
    .select("id, course_id, courses!inner(code)")
    .eq("academic_year_id", ctx.academic_year_id)
    .eq("semester_id", ctx.semester_id)
    .eq("program_id", ctx.program_id)
    .eq("level_id", ctx.level_id);

  const offerings = (offRows ?? []) as Array<{ id: string; course_id: string; courses: { code: string } }>;
  const offeringByCourseCode = new Map<string, string>();
  offerings.forEach((o) => {
    if (o.courses?.code) offeringByCourseCode.set(o.courses.code.toLowerCase(), o.id);
  });

  // Sections for those offerings
  const offeringIds = offerings.map((o) => o.id);
  const sectionByOfferingAndCode = new Map<string, string>();
  const contextSectionIds: string[] = [];
  if (offeringIds.length) {
    const { data: sects } = await sb
      .from("course_sections")
      .select("id, course_offering_id, section_code")
      .in("course_offering_id", offeringIds);
    (sects ?? []).forEach((s: { id: string; course_offering_id: string; section_code: string }) => {
      sectionByOfferingAndCode.set(`${s.course_offering_id}|${s.section_code.toLowerCase()}`, s.id);
      contextSectionIds.push(s.id);
    });
  }

  // Rooms (load all — small table)
  const roomByCode = new Map<string, string>();
  const { data: rooms } = await sb.from("rooms").select("id, code");
  (rooms ?? []).forEach((r: { id: string; code: string }) => {
    if (r.code) roomByCode.set(r.code.toLowerCase(), r.id);
  });

  // Faculty profiles
  const facultyByEmployeeNumber = new Map<string, string>();
  const { data: fac } = await sb.from("faculty_profiles").select("id, employee_number");
  (fac ?? []).forEach((f: { id: string; employee_number: string | null }) => {
    if (f.employee_number) facultyByEmployeeNumber.set(f.employee_number.toLowerCase(), f.id);
  });

  // Time slots
  const timeSlotByKey = new Map<string, string>();
  const { data: ts } = await sb.from("time_slots").select("id, day_of_week, start_time, end_time");
  (ts ?? []).forEach((t: { id: string; day_of_week: string; start_time: string; end_time: string }) => {
    timeSlotByKey.set(`${t.day_of_week}|${t.start_time}|${t.end_time}`, t.id);
  });

  return {
    offeringByCourseCode,
    sectionByOfferingAndCode,
    contextSectionIds,
    roomByCode,
    facultyByEmployeeNumber,
    timeSlotByKey,
  };
}

function normalizeTime(v: string): string | null {
  const m = v.match(TIME_RE);
  if (!m) return null;
  return `${m[1]}:${m[2]}:00`;
}

export async function validateClassSchedule(
  rows: Record<string, unknown>[],
  ctx: ScheduleContext,
  lookups: ScheduleLookups,
  client?: ScheduleDbClient,
): Promise<ScheduleValidationResult> {
  const sb = client ?? defaultClient();
  const out: ScheduleValidatedRow[] = [];
  // In-file conflict detection maps
  const roomSlot = new Map<string, number>(); // room_id|slotKey → first rowNumber
  const facSlot = new Map<string, number>();
  const secSlot = new Map<string, number>();
  const secSlotRoom = new Map<string, number>();
  const blockingConflicts: RowError[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: RowError[] = [];
    const course_code = str(raw.course_code);
    const section_code = str(raw.section_code);
    const dayRaw = norm(raw.day_of_week);
    const startRaw = str(raw.start_time);
    const endRaw = str(raw.end_time);
    const room_code = str(raw.room_code);
    const empNum = str(raw.faculty_employee_number);
    const typeRaw = norm(raw.schedule_type) || "lecture";
    const statusRaw = norm(raw.status) || "published";

    if (!course_code) errors.push({ row: rowNumber, column: "course_code", message: "كود المقرر مطلوب" });
    if (!section_code) errors.push({ row: rowNumber, column: "section_code", message: "رمز المجموعة مطلوب" });
    if (!DAYS.has(dayRaw)) errors.push({ row: rowNumber, column: "day_of_week", message: "اليوم غير صحيح" });
    const start = normalizeTime(startRaw);
    const end = normalizeTime(endRaw);
    if (!start) errors.push({ row: rowNumber, column: "start_time", message: "وقت البدء غير صحيح (HH:MM)" });
    if (!end) errors.push({ row: rowNumber, column: "end_time", message: "وقت الانتهاء غير صحيح (HH:MM)" });
    if (start && end && start >= end)
      errors.push({ row: rowNumber, column: "end_time", message: "وقت الانتهاء يجب أن يكون بعد وقت البدء" });
    if (!room_code) errors.push({ row: rowNumber, column: "room_code", message: "كود القاعة مطلوب" });
    if (!TYPES.has(typeRaw))
      errors.push({ row: rowNumber, column: "schedule_type", message: "نوع الجدول غير صحيح" });
    if (!STATUSES.has(statusRaw))
      errors.push({ row: rowNumber, column: "status", message: "حالة الجدول غير صحيحة" });

    // Lookups (context-bound)
    const offering_id = course_code ? lookups.offeringByCourseCode.get(course_code.toLowerCase()) : undefined;
    if (course_code && !offering_id)
      errors.push({ row: rowNumber, column: "course_code", message: "المقرر غير معروض ضمن السياق المختار" });

    let section_id: string | undefined;
    if (offering_id && section_code) {
      section_id = lookups.sectionByOfferingAndCode.get(`${offering_id}|${section_code.toLowerCase()}`);
      if (!section_id)
        errors.push({ row: rowNumber, column: "section_code", message: "المجموعة غير موجودة لهذا المقرر في السياق" });
    }

    const room_id = room_code ? lookups.roomByCode.get(room_code.toLowerCase()) : undefined;
    if (room_code && !room_id)
      errors.push({ row: rowNumber, column: "room_code", message: "القاعة غير موجودة" });

    let faculty_profile_id: string | null = null;
    if (empNum) {
      const fid = lookups.facultyByEmployeeNumber.get(empNum.toLowerCase());
      if (!fid) errors.push({ row: rowNumber, column: "faculty_employee_number", message: "عضو هيئة التدريس غير موجود" });
      else faculty_profile_id = fid;
    }

    if (errors.length) {
      out.push({ rowNumber, raw, errors, parsed: null });
      return;
    }

    const slotKey = `${dayRaw}|${start}|${end}`;
    // In-file conflicts
    const rsKey = `${room_id}|${slotKey}`;
    const fsKey = faculty_profile_id ? `${faculty_profile_id}|${slotKey}` : "";
    const ssKey = `${section_id}|${slotKey}`;
    const ssrKey = `${section_id}|${slotKey}|${room_id}`;
    if (roomSlot.has(rsKey))
      blockingConflicts.push({ row: rowNumber, message: `تعارض قاعة: نفس القاعة (${room_code}) ونفس الفترة مع الصف ${roomSlot.get(rsKey)}` });
    else roomSlot.set(rsKey, rowNumber);
    if (fsKey) {
      if (facSlot.has(fsKey))
        blockingConflicts.push({ row: rowNumber, message: `تعارض مدرس: نفس المدرس (${empNum}) ونفس الفترة مع الصف ${facSlot.get(fsKey)}` });
      else facSlot.set(fsKey, rowNumber);
    }
    if (secSlot.has(ssKey))
      blockingConflicts.push({ row: rowNumber, message: `تعارض مجموعة: نفس المجموعة (${course_code}/${section_code}) ونفس الفترة مع الصف ${secSlot.get(ssKey)}` });
    else secSlot.set(ssKey, rowNumber);
    if (secSlotRoom.has(ssrKey))
      blockingConflicts.push({ row: rowNumber, message: `صف مكرر: نفس المجموعة + الفترة + القاعة مع الصف ${secSlotRoom.get(ssrKey)}` });
    else secSlotRoom.set(ssrKey, rowNumber);

    out.push({
      rowNumber,
      raw,
      errors: [],
      parsed: {
        course_section_id: section_id!,
        room_id: room_id!,
        faculty_profile_id,
        day_of_week: dayRaw,
        start_time: start!,
        end_time: end!,
        schedule_type: typeRaw,
        status: statusRaw,
        _slotKey: slotKey,
      },
    });
  });

  // Cross-context DB conflicts: rooms/faculty/time-slot occupied by sections OUTSIDE this context.
  // Same context will be cleared by Replace Context so we exclude it.
  const contextSectionSet = new Set(lookups.contextSectionIds);
  // Build the set of resolved time_slot ids referenced by this file (existing only).
  // For new (auto-created) time_slots there can't be existing conflicts.
  const referencedSlotIds = new Set<string>();
  for (const r of out) {
    if (!r.parsed) continue;
    const id = lookups.timeSlotByKey.get(`${r.parsed.day_of_week}|${r.parsed.start_time}|${r.parsed.end_time}`);
    if (id) referencedSlotIds.add(id);
  }
  if (referencedSlotIds.size > 0) {
    const { data: existing } = await sb
      .from("class_schedule")
      .select("course_section_id, room_id, faculty_profile_id, time_slot_id, status")
      .in("time_slot_id", Array.from(referencedSlotIds));
    const dbRows = (existing ?? []) as Array<{
      course_section_id: string; room_id: string; faculty_profile_id: string | null; time_slot_id: string; status: string;
    }>;
    // index DB by composite keys, excluding rows we will replace
    const dbRoomSlot = new Set<string>();
    const dbFacSlot = new Set<string>();
    const dbSecSlot = new Set<string>();
    for (const d of dbRows) {
      if (contextSectionSet.has(d.course_section_id)) continue; // will be wiped by Replace Context
      if (d.status === "cancelled") continue;
      dbRoomSlot.add(`${d.room_id}|${d.time_slot_id}`);
      if (d.faculty_profile_id) dbFacSlot.add(`${d.faculty_profile_id}|${d.time_slot_id}`);
      dbSecSlot.add(`${d.course_section_id}|${d.time_slot_id}`);
    }
    for (const r of out) {
      if (!r.parsed) continue;
      const slotId = lookups.timeSlotByKey.get(`${r.parsed.day_of_week}|${r.parsed.start_time}|${r.parsed.end_time}`);
      if (!slotId) continue;
      if (dbRoomSlot.has(`${r.parsed.room_id}|${slotId}`))
        blockingConflicts.push({ row: r.rowNumber, message: "تعارض مع جدول آخر: نفس القاعة محجوزة في هذه الفترة لسياق مختلف" });
      if (r.parsed.faculty_profile_id && dbFacSlot.has(`${r.parsed.faculty_profile_id}|${slotId}`))
        blockingConflicts.push({ row: r.rowNumber, message: "تعارض مع جدول آخر: عضو هيئة التدريس محجوز في هذه الفترة لسياق مختلف" });
      if (dbSecSlot.has(`${r.parsed.course_section_id}|${slotId}`))
        blockingConflicts.push({ row: r.rowNumber, message: "تعارض مع جدول آخر: المجموعة محجوزة في هذه الفترة" });
    }
  }

  const validRows = out.filter((r) => r.parsed !== null).length;
  return {
    rows: out,
    totalRows: out.length,
    validRows,
    invalidRows: out.length - validRows,
    blockingConflicts,
  };
}

export type ScheduleImportReport = {
  rows_total: number;
  rows_inserted: number;
  rows_failed: number;
  slots_created: number;
  errors: RowError[];
  /** True iff the import was aborted before any DB write because of conflicts/invalid rows. */
  aborted: boolean;
  abortReason?: string;
};
