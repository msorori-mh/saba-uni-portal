/** Presentation only. Every destination still enforces its own authorization. */
export type FacultyHomeRole =
  | "faculty_member"
  | "department_head"
  | "vice_dean_academic"
  | "vice_dean_students"
  | "vice_dean"
  | "dean";

export type HomePosition = {
  code: string | null;
  is_active: boolean | null;
  assignment_active: boolean | null;
  assigned_from: string | null;
  assigned_to: string | null;
};

export function activeHomePositionCodes(
  positions: readonly HomePosition[],
  today: string,
): string[] {
  return [...new Set(positions.filter((p) =>
    p.assignment_active === true && p.is_active === true &&
    !!p.code && !!p.assigned_from && p.assigned_from.slice(0, 10) <= today &&
    (!p.assigned_to || p.assigned_to.slice(0, 10) >= today),
  ).map((p) => p.code!))];
}

export function resolveFacultyHomeRole(input: {
  roles: readonly string[];
  positionCodes: readonly string[];
  headedDepartmentIds: readonly string[];
}): FacultyHomeRole {
  const { roles, positionCodes, headedDepartmentIds } = input;
  // The dean's executive page requires the actual app role, not a job title.
  if (roles.includes("dean")) return "dean";
  if (positionCodes.includes("vice_dean_academic")) return "vice_dean_academic";
  if (positionCodes.includes("vice_dean_students")) return "vice_dean_students";
  if (roles.includes("vice_dean")) return "vice_dean";
  if (headedDepartmentIds.length > 0) return "department_head";
  return "faculty_member";
}

export const FACULTY_HOME_COPY: Record<FacultyHomeRole, { title: string; description: string }> = {
  faculty_member: {
    title: "أعمالي التدريسية",
    description: "ابدأ بمحاضرات اليوم، ثم راجع درجات مجموعاتك وتنفيذ خطة المقرر.",
  },
  department_head: {
    title: "متابعة القسم",
    description: "راجع تنفيذ المحاضرات في قسمك، ومشاريع التخرج والمهام المحالة إليك.",
  },
  vice_dean_academic: {
    title: "الشؤون الأكاديمية",
    description: "تابع المعاملات المكلف بها والمجالس ومشاريع التخرج، ثم راجع أعمالك التدريسية.",
  },
  vice_dean_students: {
    title: "شؤون الطلاب",
    description: "تابع الخدمات الطلابية المحالة إليك والمجالس الأكاديمية، ثم راجع أعمالك التدريسية.",
  },
  vice_dean: {
    title: "أعمال نائب العميد",
    description: "تابع المعاملات المكلف بها والمجالس الأكاديمية، ثم راجع أعمالك التدريسية.",
  },
  dean: {
    title: "متابعة الكلية",
    description: "تابع سير المحاضرات والمجالس والمهام المحالة إليك، ثم راجع أعمالك التدريسية.",
  },
};
