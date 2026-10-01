/**
 * Public-site helpers for the faculty directory.
 *
 * `get_public_faculty_directory` returns every active row, including the
 * DEMO-/TEST- identities used by the authorization and E2E suites. Those rows
 * must stay active (the suites log in with them), so the public site filters
 * them out here instead of touching production data.
 */

type DirectoryRowLike = {
  employee_id?: string | null;
  full_name_ar?: string | null;
  full_name_en?: string | null;
  rank?: string | null;
};

// employee_id prefixes used by fixtures/seeding: DEMO-F-001, DEMO-FAC,
// TEST-260930-F01, TESTONLY-…, TEST_ONLY_…
const TEST_EMPLOYEE_ID = /^(demo|test)[-_]|^test_?only/i;
const TEST_NAME_AR = /(اختبار|تجريبي|تجريبية)/;
const TEST_NAME_EN = /\btest[\s_-]*only\b|\bdemo\b|\bfixture\b/i;
const TEST_RANK = /^test[\s_-]*only$/i;

export function isTestFacultyRow(row: DirectoryRowLike): boolean {
  const employeeId = row.employee_id?.trim() ?? "";
  if (employeeId && TEST_EMPLOYEE_ID.test(employeeId)) return true;
  if (row.full_name_ar && TEST_NAME_AR.test(row.full_name_ar)) return true;
  if (row.full_name_en && TEST_NAME_EN.test(row.full_name_en)) return true;
  if (row.rank && TEST_RANK.test(row.rank.trim())) return true;
  return false;
}

export function publicFacultyOnly<T extends DirectoryRowLike>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isTestFacultyRow(row));
}

export type RankKey =
  | "professor"
  | "associate"
  | "assistant"
  | "lecturer"
  | "lecturer_assistant"
  | "teaching";

// Keys are compared after trimming and lower-casing.
const RANK_ALIASES: Record<string, RankKey> = {
  professor: "professor",
  "full professor": "professor",
  "أستاذ": "professor",
  "استاذ": "professor",
  "أستاذ دكتور": "professor",
  "associate professor": "associate",
  "أستاذ مشارك": "associate",
  "استاذ مشارك": "associate",
  "assistant professor": "assistant",
  "أستاذ مساعد": "assistant",
  "استاذ مساعد": "assistant",
  lecturer: "lecturer",
  "محاضر": "lecturer",
  "مدرّس": "lecturer",
  "مدرس": "lecturer",
  "lecturer assistant": "lecturer_assistant",
  "assistant lecturer": "lecturer_assistant",
  "محاضر مساعد": "lecturer_assistant",
  "محاضرة مساعد": "lecturer_assistant",
  "مدرس مساعد": "lecturer_assistant",
  "teaching assistant": "teaching",
  "معيد": "teaching",
  "معيدة": "teaching",
};

export function normalizeRank(rank: string | null | undefined): RankKey | null {
  if (!rank) return null;
  return RANK_ALIASES[rank.trim().replace(/\s+/g, " ").toLowerCase()] ?? null;
}

export const RANK_LABEL_AR: Record<RankKey, string> = {
  professor: "أستاذ",
  associate: "أستاذ مشارك",
  assistant: "أستاذ مساعد",
  lecturer: "مدرّس",
  lecturer_assistant: "محاضر مساعد",
  teaching: "معيد",
};

/** Arabic label for display; unknown values are shown as stored. */
export function displayRankAr(rank: string | null | undefined): string | null {
  if (!rank) return null;
  const key = normalizeRank(rank);
  return key ? RANK_LABEL_AR[key] : rank.trim();
}

/** Grammatical Arabic count of members: عضو واحد، عضوان، 3 أعضاء، 11 عضوًا. */
export function arabicMemberCount(n: number): string {
  if (n === 1) return "عضو واحد";
  if (n === 2) return "عضوان";
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} أعضاء`;
  if (n === 0) return "لا يوجد أعضاء";
  if (mod100 === 0) return `${n} عضو`;
  return `${n} عضوًا`;
}
