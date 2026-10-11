/**
 * Pure helpers for the faculty dashboard operational schedule strip.
 * No network I/O — safe for unit tests and client rendering.
 */

/** JS Date.getDay(): 0=Sunday … 6=Saturday → DB day_of_week codes */
export const JS_DAY_TO_CODE = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayOfWeekCode = (typeof JS_DAY_TO_CODE)[number];

export type TeachingScheduleSlot = {
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string | null;
  schedule_type: string;
};

export type TeachingSection = {
  id: string;
  section_code: string;
  course: { id: string; code: string; name_ar: string } | null;
  program_id: string | null;
  program_name: string | null;
  level_name: string | null;
  student_count?: number;
  schedule: TeachingScheduleSlot[];
};

export type FacultyCourseSummary = {
  id: string;
  code: string;
  name: string;
  sectionCount: number;
  programs: { id: string; name: string }[];
};

/** A section/level is an assignment, not another course or another program. */
export function summarizeFacultyCourses(sections: readonly TeachingSection[]): {
  courses: FacultyCourseSummary[];
  unresolvedSections: number;
} {
  const courses = new Map<string, FacultyCourseSummary>();
  let unresolvedSections = 0;
  for (const section of sections) {
    if (!section.course?.id) {
      unresolvedSections++;
      continue;
    }
    let course = courses.get(section.course.id);
    if (!course) {
      course = {
        id: section.course.id,
        code: section.course.code,
        name: section.course.name_ar,
        sectionCount: 0,
        programs: [],
      };
      courses.set(course.id, course);
    }
    course.sectionCount++;
    if (section.program_id && !course.programs.some((p) => p.id === section.program_id)) {
      course.programs.push({ id: section.program_id, name: section.program_name ?? "برنامج غير مسمى" });
    }
  }
  return {
    courses: [...courses.values()].sort((a, b) => a.code.localeCompare(b.code, "ar")),
    unresolvedSections,
  };
}

export type TeachingSession = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseName: string;
  programName: string | null;
  levelName: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string | null;
  schedule_type: string;
};

export function jsDayToCode(jsDay: number): DayOfWeekCode {
  const code = JS_DAY_TO_CODE[jsDay];
  if (!code) return "sunday";
  return code;
}

/** Local-calendar day code for the given date (defaults to now). */
export function getTodayDayCode(now: Date = new Date()): DayOfWeekCode {
  return jsDayToCode(now.getDay());
}

export function flattenTeachingSessions(sections: TeachingSection[]): TeachingSession[] {
  const out: TeachingSession[] = [];
  for (const section of sections) {
    for (const slot of section.schedule) {
      out.push({
        sectionId: section.id,
        sectionCode: section.section_code,
        courseCode: section.course?.code ?? "—",
        courseName: section.course?.name_ar ?? "—",
        programName: section.program_name,
        levelName: section.level_name,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        room: slot.room,
        schedule_type: slot.schedule_type,
      });
    }
  }
  return out;
}

export function getTodaySessions(
  sections: TeachingSection[],
  todayCode: string = getTodayDayCode(),
): TeachingSession[] {
  return flattenTeachingSessions(sections)
    .filter((s) => s.day_of_week === todayCode)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function countWeeklyTeachingSlots(sections: TeachingSection[]): number {
  return flattenTeachingSessions(sections).length;
}

/** Truthful processing-access label — never invents a pending count. */
export function processingAccessSummaryLabel(opts: {
  hasAssignment: boolean;
  isAdmin: boolean;
} | null | undefined): string {
  if (!opts) return "جارٍ التحقق…";
  if (opts.hasAssignment || opts.isAdmin) return "تحتاج متابعة";
  return "لا توجد صلاحية معالجة";
}
