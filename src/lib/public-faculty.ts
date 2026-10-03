/**
 * Public-site guard for the faculty directory.
 *
 * `get_public_faculty_directory` returns every active row, including the
 * DEMO-/TEST- identities used by the authorization and E2E suites. Those rows
 * must stay active (the suites sign in with them), so the public site filters
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
