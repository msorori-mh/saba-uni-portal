/**
 * Course syllabus import (official academic source of the lecture plan).
 *
 * One row = one planned lecture of one course. Course-level metadata may be
 * repeated on every row of the same course; the first non-empty value wins.
 * Validation is fail-closed: any invalid row rejects the whole file, exactly
 * like the other official import templates.
 */

export type SyllabusImportRow = {
  course_code: string;
  session_number: number;
  week_number: number | null;
  title_ar: string;
  topics_ar: string | null;
};

export type SyllabusCourseGroup = {
  course_code: string;
  description_ar: string | null;
  objectives_ar: string | null;
  references_ar: string | null;
  sessions: SyllabusImportRow[];
};

export type SyllabusRowError = { row: number; message: string };

export type SyllabusValidationResult = {
  totalRows: number;
  courses: SyllabusCourseGroup[];
  errors: SyllabusRowError[];
  valid: boolean;
};

const COLUMN_ALIASES: Record<string, string> = {
  "كود المقرر": "course_code",
  course_code: "course_code",
  "رقم المحاضرة": "session_number",
  session_number: "session_number",
  "الأسبوع": "week_number",
  week_number: "week_number",
  "عنوان المحاضرة": "title_ar",
  title_ar: "title_ar",
  "المفردات": "topics_ar",
  topics_ar: "topics_ar",
  "وصف المقرر": "description_ar",
  description_ar: "description_ar",
  "أهداف المقرر": "objectives_ar",
  objectives_ar: "objectives_ar",
  "المراجع": "references_ar",
  references_ar: "references_ar",
};

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return COLUMN_ALIASES[trimmed] ?? trimmed;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function intOrNull(value: unknown): number | null {
  const raw = text(value);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function validateCourseSyllabusRows(
  rawRows: Record<string, unknown>[],
): SyllabusValidationResult {
  const errors: SyllabusRowError[] = [];
  const byCourse = new Map<string, SyllabusCourseGroup>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) row[normalizeKey(key)] = value;

    const courseCode = text(row["course_code"]);
    const sessionNumber = intOrNull(row["session_number"]);
    const weekNumber = intOrNull(row["week_number"]);
    const title = text(row["title_ar"]);
    const topics = text(row["topics_ar"]);

    if (!courseCode) errors.push({ row: rowNumber, message: "كود المقرر مطلوب" });
    if (sessionNumber === null || sessionNumber < 1)
      errors.push({ row: rowNumber, message: "رقم المحاضرة يجب أن يكون رقماً صحيحاً >= 1" });
    if (weekNumber !== null && (weekNumber < 1 || weekNumber > 30))
      errors.push({ row: rowNumber, message: "الأسبوع يجب أن يكون بين 1 و 30" });
    if (!title) errors.push({ row: rowNumber, message: "عنوان المحاضرة مطلوب" });

    if (!courseCode || sessionNumber === null || !title) return;

    let group = byCourse.get(courseCode);
    if (!group) {
      group = {
        course_code: courseCode,
        description_ar: null,
        objectives_ar: null,
        references_ar: null,
        sessions: [],
      };
      byCourse.set(courseCode, group);
    }
    group.description_ar ||= text(row["description_ar"]) || null;
    group.objectives_ar ||= text(row["objectives_ar"]) || null;
    group.references_ar ||= text(row["references_ar"]) || null;

    group.sessions.push({
      course_code: courseCode,
      session_number: sessionNumber,
      week_number: weekNumber,
      title_ar: title,
      topics_ar: topics || null,
    });
  });

  for (const group of byCourse.values()) {
    group.sessions.sort((a, b) => a.session_number - b.session_number);
    const seen = new Set<number>();
    group.sessions.forEach((s, i) => {
      if (seen.has(s.session_number)) {
        errors.push({
          row: 0,
          message: `المقرر ${group.course_code}: رقم المحاضرة ${s.session_number} مكرر`,
        });
      }
      seen.add(s.session_number);
      if (s.session_number !== i + 1) {
        errors.push({
          row: 0,
          message: `المقرر ${group.course_code}: تسلسل أرقام المحاضرات غير متصل عند ${s.session_number}`,
        });
      }
    });
  }

  const courses = [...byCourse.values()].sort((a, b) => a.course_code.localeCompare(b.course_code));
  return { totalRows: rawRows.length, courses, errors, valid: errors.length === 0 };
}
