import { gradeArabicLabel, officialWeightedAverage } from "@/lib/academic/grading-scale";

export type AcademicTranscriptCourse = {
  enrollment_id: string;
  course_id: string;
  course_code: string;
  course_name_ar: string;
  credit_hours: number;
  academic_year_id: string;
  academic_year_name: string;
  academic_year_start_date: string;
  semester_id: string;
  semester_name: string;
  semester_code: string;
  semester_start_date: string;
  official_result: number | null;
  grade_label: string | null;
  result: "passed" | "failed" | "in_progress";
};

export type AcademicTranscriptTerm = {
  key: string;
  academicYearName: string;
  semesterName: string;
  courses: AcademicTranscriptCourse[];
  registeredHours: number;
  earnedHours: number;
  termAverage: number;
  cumulativeAverage: number;
};

export function buildAcademicTranscriptTerms(
  courses: AcademicTranscriptCourse[],
): AcademicTranscriptTerm[] {
  const sorted = [...courses].sort(
    (a, b) =>
      a.academic_year_start_date.localeCompare(b.academic_year_start_date) ||
      a.semester_start_date.localeCompare(b.semester_start_date) ||
      a.course_code.localeCompare(b.course_code),
  );
  const groups = new Map<string, AcademicTranscriptCourse[]>();
  for (const course of sorted) {
    const key = `${course.academic_year_id}:${course.semester_id}`;
    const group = groups.get(key) ?? [];
    group.push(course);
    groups.set(key, group);
  }

  const completedSoFar: AcademicTranscriptCourse[] = [];
  return Array.from(groups.entries()).map(([key, termCourses]) => {
    const completed = termCourses.filter((course) => course.official_result != null);
    completedSoFar.push(...completed);
    return {
      key,
      academicYearName: termCourses[0]?.academic_year_name ?? "—",
      semesterName: termCourses[0]?.semester_name ?? "—",
      courses: termCourses,
      registeredHours: termCourses.reduce((sum, course) => sum + course.credit_hours, 0),
      earnedHours: termCourses
        .filter((course) => course.result === "passed")
        .reduce((sum, course) => sum + course.credit_hours, 0),
      termAverage: officialWeightedAverage(
        completed.map((course) => ({ raw: course.official_result, creditHours: course.credit_hours })),
      ),
      cumulativeAverage: officialWeightedAverage(
        completedSoFar.map((course) => ({ raw: course.official_result, creditHours: course.credit_hours })),
      ),
    };
  });
}

export function overallGradeLabel(average: number): string | null {
  return average > 0 ? gradeArabicLabel(average) : null;
}