export type CurrentAcademicYear = {
  id: string;
  name: string;
};

export type CurrentSemester = {
  id: string;
  name: string;
  academic_year_id: string;
};

export type CurrentTerm = {
  year: CurrentAcademicYear;
  semester: CurrentSemester;
};

export function resolveCanonicalCurrentTerm(
  years: CurrentAcademicYear[],
  semesters: CurrentSemester[],
): CurrentTerm | null {
  if (years.length !== 1 || semesters.length !== 1) return null;

  const year = years[0];
  const semester = semesters[0];
  if (!year?.id || !semester?.id || semester.academic_year_id !== year.id) return null;

  return { year, semester };
}

type QueryResult<T> = { data: T[] | null; error: { message?: string } | null };
type CurrentTermClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => {
        limit: (count: number) => Promise<QueryResult<unknown>>;
      };
    };
  };
};

export async function fetchCanonicalCurrentTerm(client: CurrentTermClient): Promise<CurrentTerm | null> {
  const [yearResult, semesterResult] = await Promise.all([
    client.from("academic_years").select("id, name").eq("is_current", true).limit(2),
    client
      .from("semesters")
      .select("id, name, academic_year_id")
      .eq("is_current", true)
      .limit(2),
  ]);

  if (yearResult.error) throw new Error(yearResult.error.message ?? "Failed to resolve current academic year");
  if (semesterResult.error) throw new Error(semesterResult.error.message ?? "Failed to resolve current semester");

  return resolveCanonicalCurrentTerm(
    (yearResult.data ?? []) as CurrentAcademicYear[],
    (semesterResult.data ?? []) as CurrentSemester[],
  );
}
